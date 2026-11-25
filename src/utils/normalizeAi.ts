import type { IndoorHack, RoutineBlock, TailoredPlanResponse } from '../types/air';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function asPhase(value: unknown, index: number): RoutineBlock['phase'] {
  const valid: RoutineBlock['phase'][] = ['Morning', 'Midday', 'Afternoon', 'Evening'];
  if (typeof value === 'string') {
    const match = valid.find((p) => p.toLowerCase() === value.trim().toLowerCase());
    if (match) return match;
  }
  return valid[index % valid.length];
}

export function normalizeTailoredPlan(raw: unknown): TailoredPlanResponse {
  const obj = asRecord(raw);
  if (!obj) {
    throw new Error('The AI returned an unexpected response format. Please retry.');
  }

  const inversionBrief = asString(obj.inversionBrief ?? obj.inversion_brief);

  const rawBlocks = Array.isArray(obj.routineBlocks)
    ? obj.routineBlocks
    : Array.isArray(obj.routine_blocks)
      ? obj.routine_blocks
      : [];

  const routineBlocks: Omit<RoutineBlock, 'isAiTailored'>[] = rawBlocks
    .map((item, idx) => {
      const b = asRecord(item);
      if (!b) return null;
      const title = asString(b.title);
      const action = asString(b.action);
      if (!title && !action) return null;
      return {
        id: asString(b.id, `ai-block-${idx + 1}`),
        timeWindow: asString(b.timeWindow ?? b.time_window, ['07:00 – 09:30', '12:00 – 14:00', '15:30 – 18:00', '18:00 – 22:00'][idx % 4]),
        phase: asPhase(b.phase, idx),
        title: title || `Step ${idx + 1}`,
        action: action || title,
        directImpact: asString(
          b.directImpact ?? b.direct_impact,
          'Directly reduces household particulate exposure and local winter smog accumulation.'
        ),
        emissionSavedLabel: asString(b.emissionSavedLabel ?? b.emission_saved_label, 'Lower local emissions'),
        exposureDeltaLabel: asString(b.exposureDeltaLabel ?? b.exposure_delta_label, 'Lower PM2.5 exposure'),
      };
    })
    .filter((b): b is Omit<RoutineBlock, 'isAiTailored'> => b !== null);

  const priorityIndoorTips = asStringArray(obj.priorityIndoorTips ?? obj.priority_indoor_tips);

  const rawSpotlight = asRecord(obj.topSwapSpotlight ?? obj.top_swap_spotlight);
  const topSwapSpotlight =
    rawSpotlight && asString(rawSpotlight.title)
      ? {
          title: asString(rawSpotlight.title),
          replaces: asString(rawSpotlight.replaces, 'Higher-emission winter habit'),
          directImpactExplanation: asString(
            rawSpotlight.directImpactExplanation ?? rawSpotlight.direct_impact_explanation,
            'Cuts direct combustion particulates and winter greenhouse emissions.'
          ),
          weeklyCo2Kg: Math.max(0, Number(rawSpotlight.weeklyCo2Kg ?? rawSpotlight.weekly_co2_kg) || 0),
          dailyPm25GramsAvoided: Math.max(
            0,
            Number(rawSpotlight.dailyPm25GramsAvoided ?? rawSpotlight.daily_pm25_grams_avoided) || 0
          ),
        }
      : {
          title: 'Reduce peak-inversion combustion',
          replaces: 'Unvented or solid-fuel heating',
          directImpactExplanation:
            'Eliminating evening smoke and cold-start exhaust directly lowers street-level PM2.5.',
          weeklyCo2Kg: 12,
          dailyPm25GramsAvoided: 15,
        };

  if (!inversionBrief && routineBlocks.length === 0) {
    throw new Error('The AI returned an incomplete plan. Please try again.');
  }

  return {
    inversionBrief:
      inversionBrief ||
      'Today’s winter thermal inversion traps surface emissions during morning and evening hours. Prioritize clean indoor sleep air and low-emission mobility.',
    routineBlocks,
    priorityIndoorTips,
    topSwapSpotlight,
  };
}

export function normalizeCustomHack(raw: unknown): Omit<IndoorHack, 'id' | 'isCustomAi'> {
  const obj = asRecord(raw);
  if (!obj) {
    throw new Error('The AI returned an unexpected indoor hack format. Please retry.');
  }

  const title = asString(obj.title);
  if (!title) {
    throw new Error('The AI returned an incomplete indoor hack. Please try again.');
  }

  const validCategories: IndoorHack['category'][] = [
    'Filtration',
    'Ventilation',
    'Source Control',
    'Room Sealing',
  ];
  const rawCat = asString(obj.category);
  const category =
    validCategories.find((c) => c.toLowerCase() === rawCat.toLowerCase()) ?? 'Filtration';

  const rawFactor = Number(obj.pm25ReductionFactor ?? obj.pm25_reduction_factor);
  const pm25ReductionFactor = Number.isFinite(rawFactor)
    ? Math.min(0.45, Math.max(0.08, rawFactor > 1 ? rawFactor / 100 : rawFactor))
    : 0.2;

  const steps = asStringArray(obj.steps);

  return {
    title,
    category,
    costLabel: asString(obj.costLabel ?? obj.cost_label, 'Low cost'),
    setupTime: asString(obj.setupTime ?? obj.setup_time, '15 min'),
    pm25ReductionFactor,
    summary: asString(obj.summary, 'Tailored low-cost protocol to lower indoor winter PM2.5.'),
    mechanism: asString(
      obj.mechanism,
      'Reduces fine particulate infiltration or indoor combustion buildup in occupied living spaces.'
    ),
    steps: steps.length > 0 ? steps : ['Follow the protocol steadily during peak morning and evening smog hours.'],
  };
}

export function normalizeAdvisorReply(raw: unknown): { reply: string; impactSummary: string[] } {
  const obj = asRecord(raw);
  if (!obj) {
    throw new Error('The AI advisor returned an unexpected format. Please retry.');
  }
  const reply = asString(obj.reply ?? obj.message ?? obj.answer);
  if (!reply) {
    throw new Error('The AI advisor returned an empty reply. Please try again.');
  }
  const impactSummary = asStringArray(obj.impactSummary ?? obj.impact_summary);
  return { reply, impactSummary };
}
