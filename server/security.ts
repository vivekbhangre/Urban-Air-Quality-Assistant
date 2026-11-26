import type { NextFunction, Request, Response } from 'express';

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS_RE, '').trim().slice(0, maxLength);
}

export interface SanitizedProfilePayload {
  city: string;
  regionLabel: string;
  currentAqi: number;
  outdoorPm25: number;
  householdSize: number;
  communityHomes: number;
  heating: string;
  commute: string;
  cooking: string;
  building: string;
  sensitivities: string[];
}

const ALLOWED_HEATING = new Set([
  'wood_coal',
  'gas_furnace',
  'district_heating',
  'heat_pump',
  'electric_space',
]);
const ALLOWED_COMMUTE = new Set([
  'solo_car',
  'diesel_commute',
  'public_transit',
  'walk_cycle',
  'hybrid_remote',
]);
const ALLOWED_COOKING = new Set(['gas_stove', 'induction', 'electric_coil', 'biomass_solid']);
const ALLOWED_BUILDING = new Set([
  'older_drafty',
  'modern_insulated',
  'apartment_midrise',
  'detached_home',
]);
const ALLOWED_SENSITIVITIES = new Set([
  'children',
  'older_adults',
  'asthma_respiratory',
  'outdoor_workers',
]);

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function validateProfilePayload(
  raw: unknown
): { ok: true; data: SanitizedProfilePayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'A valid household profile object is required.' };
  }
  const obj = raw as Record<string, unknown>;
  const city = sanitizeText(obj.city, 100);
  if (city.length < 2) {
    return { ok: false, error: 'A valid city or neighborhood name (2–100 characters) is required.' };
  }

  const heatingRaw = sanitizeText(obj.heating, 40);
  const commuteRaw = sanitizeText(obj.commute, 40);
  const cookingRaw = sanitizeText(obj.cooking, 40);
  const buildingRaw = sanitizeText(obj.building, 40);

  const sensitivities = Array.isArray(obj.sensitivities)
    ? obj.sensitivities
        .map((s) => sanitizeText(s, 40))
        .filter((s) => ALLOWED_SENSITIVITIES.has(s))
        .slice(0, 4)
    : [];

  return {
    ok: true,
    data: {
      city,
      regionLabel: sanitizeText(obj.regionLabel, 100) || 'Urban Winter Basin',
      currentAqi: clampNumber(obj.currentAqi, 0, 500, 180),
      outdoorPm25: clampNumber(obj.outdoorPm25, 0, 600, 110),
      householdSize: clampNumber(obj.householdSize, 1, 25, 3),
      communityHomes: clampNumber(obj.communityHomes, 1, 10000, 50),
      heating: ALLOWED_HEATING.has(heatingRaw) ? heatingRaw : 'gas_furnace',
      commute: ALLOWED_COMMUTE.has(commuteRaw) ? commuteRaw : 'solo_car',
      cooking: ALLOWED_COOKING.has(cookingRaw) ? cookingRaw : 'gas_stove',
      building: ALLOWED_BUILDING.has(buildingRaw) ? buildingRaw : 'older_drafty',
      sensitivities,
    },
  };
}

export function validateHackRequest(
  body: unknown
): { ok: true; challenge: string; profile: SanitizedProfilePayload | null } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const { profile, challenge } = body as Record<string, unknown>;
  const cleanChallenge = sanitizeText(challenge, 500);
  if (cleanChallenge.length < 10) {
    return { ok: false, error: 'Please describe your home air challenge in at least 10 characters.' };
  }
  const parsedProfile = profile ? validateProfilePayload(profile) : null;
  return {
    ok: true,
    challenge: cleanChallenge,
    profile: parsedProfile && parsedProfile.ok ? parsedProfile.data : null,
  };
}

export interface SanitizedChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function validateChatRequest(
  body: unknown
): { ok: true; messages: SanitizedChatMessage[]; profile: SanitizedProfilePayload | null } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body.' };
  }
  const { profile, messages } = body as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'At least one message is required.' };
  }

  const sanitized: SanitizedChatMessage[] = [];
  for (const entry of messages.slice(-10)) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const content = sanitizeText(rec.content, 1000);
    if (!content) continue;
    sanitized.push({
      role: rec.role === 'assistant' ? 'assistant' : 'user',
      content,
    });
  }

  if (sanitized.length === 0) {
    return { ok: false, error: 'Please provide a non-empty question.' };
  }

  const parsedProfile = profile ? validateProfilePayload(profile) : null;
  return {
    ok: true,
    messages: sanitized,
    profile: parsedProfile && parsedProfile.ok ? parsedProfile.data : null,
  };
}

/**
 * Lightweight, memory-bounded sliding-window rate limiter.
 * Prevents excessive API consumption without external dependencies.
 */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(maxRequests: number, windowMs: number, maxEntries = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
  }

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number; remaining: number } {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      const oldestInWindow = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + this.windowMs - now) / 1000));
      return { allowed: false, retryAfterSeconds, remaining: 0 };
    }

    recent.push(now);
    this.hits.set(key, recent);

    // Bounded memory eviction when map grows past capacity
    if (this.hits.size > this.maxEntries) {
      this.prune(now);
    }

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, this.maxRequests - recent.length),
    };
  }

  prune(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [k, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter((ts) => ts > cutoff);
      if (valid.length === 0) {
        this.hits.delete(k);
      } else {
        this.hits.set(k, valid);
      }
    }
  }
}

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
}

export function jsonSyntaxErrorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON request body.' });
    return;
  }
  next(err);
}

export function createRateLimitMiddleware(limiter: SlidingWindowRateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
    const result = limiter.check(clientKey);
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(429).json({
        error: `Too many AI requests. Please wait ${result.retryAfterSeconds} seconds before trying again.`,
      });
      return;
    }
    next();
  };
}
