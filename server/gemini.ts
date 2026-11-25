import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { SanitizedProfilePayload } from './security.ts';

export const GEMINI_MODEL = 'gemini-4-hydrogen';
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

let cachedKey: string | null = null;
let cachedClient: GoogleGenAI | null = null;

/**
 * Reuses a single GoogleGenAI client instance across requests for lower
 * allocation and socket overhead, re-initializing only if the key changes.
 */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    cachedKey = null;
    cachedClient = null;
    return null;
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedKey = apiKey;
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 18_000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export function isAiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

export function mapGeminiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      message: 'The configured Gemini API key could not be authenticated. Please check Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      message:
        'Free-tier daily Gemini API quota reached. Please try again later, or select a billing-enabled API key in Settings > Secrets for higher limits.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: 'The requested Gemini model endpoint was not found.',
    };
  }
  if (lower.includes('unavailable') || lower.includes('overloaded') || lower.includes('503')) {
    return {
      status: 503,
      message: 'The AI service is momentarily busy. Please wait a few seconds and retry.',
    };
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return {
      status: 504,
      message: 'The AI service took too long to respond. Please try again in a moment.',
    };
  }
  if (lower.includes('invalid_argument') || lower.includes('400')) {
    return {
      status: 400,
      message: 'The AI request parameters were rejected. Please adjust your input and retry.',
    };
  }
  return {
    status: 502,
    message: 'Unable to reach the AI assistant right now. Please retry in a few seconds.',
  };
}

function isRetryableError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    raw.includes('503') ||
    raw.includes('unavailable') ||
    raw.includes('overloaded') ||
    raw.includes('timeout') ||
    raw.includes('econnreset')
  );
}

export function isQuotaOrRateLimitError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return raw.includes('resource_exhausted') || raw.includes('429') || raw.includes('quota');
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Executes a Gemini request against the primary model and automatically falls back
 * to a secondary free-tier model when per-model quota (429) or transient outages (503) occur.
 */
export async function generateWithModelFallback<T>(
  runForModel: (model: string) => Promise<T>,
  models: readonly string[] = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL],
  cooldowns?: Map<string, number>,
  now = Date.now()
): Promise<T> {
  const activeModels = cooldowns
    ? models.filter((m, idx) => idx === models.length - 1 || (cooldowns.get(m) ?? 0) <= now)
    : models;
  const candidates = activeModels.length > 0 ? activeModels : models;

  let lastError: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const hasNextModel = i < candidates.length - 1;
    try {
      return await withRetry(() => runForModel(model), hasNextModel ? 0 : 1);
    } catch (error) {
      lastError = error;
      if (cooldowns && isQuotaOrRateLimitError(error)) {
        cooldowns.set(model, now + 10 * 60 * 1000);
      }
      if (hasNextModel && (isQuotaOrRateLimitError(error) || isRetryableError(error))) {
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export function parseModelJson<T>(rawText: string): T {
  const trimmed = rawText.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(unfenced) as T;
}

/**
 * Bounded TTL cache to avoid duplicate Gemini calls for identical household profiles.
 */
export class BoundedTtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries = 50) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
  }
}

export function profileCacheKey(profile: SanitizedProfilePayload): string {
  return JSON.stringify([
    profile.city.toLowerCase(),
    profile.currentAqi,
    profile.householdSize,
    profile.heating,
    profile.commute,
    profile.cooking,
    profile.building,
    [...profile.sensitivities].sort(),
  ]);
}

export function formatProfileContext(profile: SanitizedProfilePayload | null): string {
  if (!profile) return 'General urban winter household';
  return [
    `Location: ${profile.city} (${profile.regionLabel})`,
    `Current Winter AQI: ${profile.currentAqi} (Outdoor PM2.5 ~${profile.outdoorPm25} µg/m³)`,
    `Household: ${profile.householdSize} residents; sensitivities: ${profile.sensitivities.join(', ') || 'none'}`,
    `Community Neighborhood Size: ${profile.communityHomes} homes`,
    `Home Heating: ${profile.heating}`,
    `Primary Commute: ${profile.commute}`,
    `Cooking Setup: ${profile.cooking}`,
    `Building Type: ${profile.building}`,
  ].join('\n');
}

export const TAILORED_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    inversionBrief: {
      type: Type.STRING,
      description:
        '2-3 crisp sentences explaining today’s winter smog dynamics in this specific city and the #1 leverage point for this household.',
    },
    routineBlocks: {
      type: Type.ARRAY,
      description: 'Exactly 4 chronological daily routine blocks: Morning, Midday, Afternoon, Evening.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          timeWindow: { type: Type.STRING, description: 'e.g. 07:00 – 09:30' },
          phase: { type: Type.STRING, description: 'One of Morning, Midday, Afternoon, Evening' },
          title: { type: Type.STRING, description: 'Short practical title (5-8 words)' },
          action: {
            type: Type.STRING,
            description: 'Specific low-emission & exposure-reducing action tailored to the household.',
          },
          directImpact: {
            type: Type.STRING,
            description: 'Clear 1-2 sentence explanation of why this choice directly lowers lung exposure or local smog.',
          },
          emissionSavedLabel: {
            type: Type.STRING,
            description: 'Short quantified emission saving, e.g. -2.4 kg CO2e / day or -45 g PM2.5 / night',
          },
          exposureDeltaLabel: {
            type: Type.STRING,
            description: 'Short quantified exposure change, e.g. -48% commute PM2.5 dose',
          },
        },
        required: [
          'id',
          'timeWindow',
          'phase',
          'title',
          'action',
          'directImpact',
          'emissionSavedLabel',
          'exposureDeltaLabel',
        ],
      },
    },
    priorityIndoorTips: {
      type: Type.ARRAY,
      description: '3 high-priority indoor air quality tips tailored to this home.',
      items: { type: Type.STRING },
    },
    topSwapSpotlight: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        replaces: { type: Type.STRING },
        directImpactExplanation: { type: Type.STRING },
        weeklyCo2Kg: { type: Type.NUMBER },
        dailyPm25GramsAvoided: { type: Type.NUMBER },
      },
      required: ['title', 'replaces', 'directImpactExplanation', 'weeklyCo2Kg', 'dailyPm25GramsAvoided'],
    },
  },
  required: ['inversionBrief', 'routineBlocks', 'priorityIndoorTips', 'topSwapSpotlight'],
};

export const CUSTOM_HACK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    category: {
      type: Type.STRING,
      description: 'One of Filtration, Ventilation, Source Control, Room Sealing',
    },
    costLabel: { type: Type.STRING, description: 'Short cost estimate e.g. $0 or $18 hardware store' },
    setupTime: { type: Type.STRING, description: 'Short setup duration e.g. 15 min' },
    pm25ReductionFactor: {
      type: Type.NUMBER,
      description: 'Realistic fractional indoor PM2.5 reduction between 0.08 and 0.45',
    },
    summary: { type: Type.STRING, description: 'One concise sentence summarizing the hack.' },
    mechanism: {
      type: Type.STRING,
      description: 'Clear 2-sentence explanation of the physical mechanism and direct health impact.',
    },
    steps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 4 actionable, safe implementation steps.',
    },
  },
  required: ['title', 'category', 'costLabel', 'setupTime', 'pm25ReductionFactor', 'summary', 'mechanism', 'steps'],
};

export const ADVISOR_CHAT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: 'Clear, empathetic, practical guidance tailored to the family profile and question.',
    },
    impactSummary: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2-3 concise impact takeaways explaining the direct health or emission result of following this advice.',
    },
  },
  required: ['reply', 'impactSummary'],
};

export const LOW_LATENCY_THINKING = { thinkingLevel: ThinkingLevel.LOW };

export function thinkingConfigForModel(model: string): { thinkingLevel: ThinkingLevel } {
  return model === GEMINI_FALLBACK_MODEL
    ? { thinkingLevel: ThinkingLevel.MINIMAL }
    : LOW_LATENCY_THINKING;
}
