import { DEFAULT_PROFILE } from '../data/airData';
import type { HouseholdProfile, IndoorHack } from '../types/air';

export const STORAGE_KEY = 'clearwinter_state_v1';

export interface PersistedState {
  profile: HouseholdProfile;
  completedRoutineIds: string[];
  activeHackIds: string[];
  customHacks: IndoorHack[];
  selectedSwapIds: string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createDefaultPersistedState(): PersistedState {
  return {
    profile: { ...DEFAULT_PROFILE, sensitivities: [...DEFAULT_PROFILE.sensitivities] },
    completedRoutineIds: ['midday-vent'],
    activeHackIds: ['corsi-rosenthal', 'range-hood-rear-burner'],
    customHacks: [],
    selectedSwapIds: ['swap-no-wood-burn', 'swap-cold-start-transit', 'swap-thermostat-setback'],
  };
}

function filterStringIds(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function isValidCustomHack(value: unknown): value is IndoorHack {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    Array.isArray(record.steps)
  );
}

/**
 * Safely hydrates persisted household state from browser storage, falling back
 * gracefully when storage is empty, unavailable, or contains malformed JSON.
 */
export function loadPersistedState(storage?: StorageLike | null): PersistedState {
  const fallback = createDefaultPersistedState();
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;

  if (!targetStorage) return fallback;

  try {
    const raw = targetStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const hydratedProfile: HouseholdProfile =
      parsed.profile && typeof parsed.profile.city === 'string' && parsed.profile.city.trim()
        ? {
            ...fallback.profile,
            ...parsed.profile,
            sensitivities: Array.isArray(parsed.profile.sensitivities)
              ? parsed.profile.sensitivities
              : fallback.profile.sensitivities,
          }
        : fallback.profile;

    return {
      profile: hydratedProfile,
      completedRoutineIds: filterStringIds(parsed.completedRoutineIds, fallback.completedRoutineIds),
      activeHackIds: filterStringIds(parsed.activeHackIds, fallback.activeHackIds),
      customHacks: Array.isArray(parsed.customHacks)
        ? parsed.customHacks.filter(isValidCustomHack)
        : [],
      selectedSwapIds: filterStringIds(parsed.selectedSwapIds, fallback.selectedSwapIds),
    };
  } catch {
    return fallback;
  }
}

/**
 * Persists household state to storage while silently ignoring restricted-sandbox quota errors.
 */
export function savePersistedState(
  state: PersistedState,
  storage?: StorageLike | null
): void {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;

  if (!targetStorage) return;

  try {
    targetStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private-mode access errors
  }
}
