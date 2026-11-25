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

async function handleJsonResponse<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof payload?.error === 'string' && payload.error.trim().length > 0
        ? payload.error
        : `Request failed with status ${res.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchTailoredPlan(
  profile: HouseholdProfile,
  forceRefresh = false
): Promise<TailoredPlanResponse> {
  const res = await fetch('/api/plan/tailor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, forceRefresh }),
  });
  const raw = await handleJsonResponse<unknown>(res);
  return normalizeTailoredPlan(raw);
}

export async function generateCustomIndoorHack(
  profile: HouseholdProfile,
  challenge: string
): Promise<Omit<IndoorHack, 'id' | 'isCustomAi'>> {
  const res = await fetch('/api/hacks/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, challenge }),
  });
  const raw = await handleJsonResponse<unknown>(res);
  return normalizeCustomHack(raw);
}

export async function sendAdvisorMessage(
  profile: HouseholdProfile,
  messages: Pick<AdvisorMessage, 'role' | 'content'>[]
): Promise<{ reply: string; impactSummary: string[] }> {
  const res = await fetch('/api/advisor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, messages }),
  });
  const raw = await handleJsonResponse<unknown>(res);
  return normalizeAdvisorReply(raw);
}
