import type {
  AdvisorMessage,
  HouseholdProfile,
  IndoorHack,
  TailoredPlanResponse,
} from '../types/air';
import {
  normalizeAdvisorReply,
  normalizeCustomHack,
  normalizeTailoredPlan,
} from '../utils/normalizeAi';

const DEFAULT_API_TIMEOUT_MS = 25_000;

async function handleJsonResponse<T>(res: Response): Promise<T> {
  const payload = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) {
    const message =
      typeof payload?.error === 'string' && payload.error.trim().length > 0
        ? payload.error
        : `Request failed with status ${res.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

async function postJson<T>(
  url: string,
  body: unknown,
  externalSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_API_TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await handleJsonResponse<T>(res);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request timed out while waiting for ClearWinter AI. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Requests a profile-tailored daily winter smog plan from the server Gemini endpoint.
 */
export async function fetchTailoredPlan(
  profile: HouseholdProfile,
  forceRefresh = false,
  signal?: AbortSignal
): Promise<TailoredPlanResponse> {
  const raw = await postJson<unknown>('/api/plan/tailor', { profile, forceRefresh }, signal);
  return normalizeTailoredPlan(raw);
}

/**
 * Generates a custom indoor air quality protocol for a specific home challenge.
 */
export async function generateCustomIndoorHack(
  profile: HouseholdProfile,
  challenge: string,
  signal?: AbortSignal
): Promise<Omit<IndoorHack, 'id' | 'isCustomAi'>> {
  const raw = await postJson<unknown>('/api/hacks/custom', { profile, challenge }, signal);
  return normalizeCustomHack(raw);
}

/**
 * Sends conversation turns and household profile context to the ClearWinter Air Advisor.
 */
export async function sendAdvisorMessage(
  profile: HouseholdProfile,
  messages: Pick<AdvisorMessage, 'role' | 'content'>[],
  signal?: AbortSignal
): Promise<{ reply: string; impactSummary: string[] }> {
  const raw = await postJson<unknown>('/api/advisor/chat', { profile, messages }, signal);
  return normalizeAdvisorReply(raw);
}
