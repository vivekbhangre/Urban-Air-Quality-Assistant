import type {
  AqiClassification,
  CityPreset,
  HourlyAirPoint,
  HouseholdProfile,
  IndoorAirEstimate,
  IndoorHack,
  RoutineBlock,
  SustainableSwap,
  SwapImpactTotals,
} from '../types/air';

const WHO_24H_PM25_GUIDELINE = 15; // µg/m³ WHO 2021 24-hour guideline
const WINTER_SEASON_DAYS = 90;
const WINTER_SEASON_WEEKS = WINTER_SEASON_DAYS / 7;

export function classifyAqi(aqi: number): AqiClassification {
  const safeAqi = Number.isFinite(aqi) ? Math.max(0, Math.round(aqi)) : 0;

  if (safeAqi <= 50) {
    return {
      label: 'Good',
      shortAdvice: 'Low particulate load. Normal outdoor routines and full cross-ventilation are safe.',
      textColorClass: 'text-[#15803D]',
      surfaceColorClass: 'bg-[#F0FDF4] border-[#BBF7D0]',
      dotColorHex: '#15803D',
    };
  }
  if (safeAqi <= 100) {
    return {
      label: 'Moderate',
      shortAdvice: 'Light urban haze. Sensitive individuals should avoid heavy exertion near arterial roads.',
      textColorClass: 'text-[#A16207]',
      surfaceColorClass: 'bg-[#FEFCE8] border-[#FEF08A]',
      dotColorHex: '#CA8A04',
    };
  }
  if (safeAqi <= 150) {
    return {
      label: 'Unhealthy for Sensitive',
      shortAdvice: 'Winter inversion building. Children and asthma-prone adults should shift exercise indoors.',
      textColorClass: 'text-[#C2410C]',
      surfaceColorClass: 'bg-[#FFF7ED] border-[#FED7AA]',
      dotColorHex: '#EA580C',
    };
  }
  if (safeAqi <= 200) {
    return {
      label: 'Unhealthy',
      shortAdvice: 'Elevated PM2.5 across the valley. Run HEPA filtration and limit unmasked street exposure.',
      textColorClass: 'text-[#B91C1C]',
      surfaceColorClass: 'bg-[#FEF2F2] border-[#FECACA]',
      dotColorHex: '#DC2626',
    };
  }
  if (safeAqi <= 300) {
    return {
      label: 'Very Unhealthy',
      shortAdvice: 'Severe winter smog inversion. Seal drafts, wear N95/FFP2 outdoors, and avoid all wood burning.',
      textColorClass: 'text-[#991B1B]',
      surfaceColorClass: 'bg-[#FEF2F2] border-[#FCA5A5]',
      dotColorHex: '#991B1B',
    };
  }
  return {
    label: 'Hazardous',
    shortAdvice: 'Emergency particulate episode. Keep windows sealed, operate a clean-air room continuously, and cancel outdoor drills.',
    textColorClass: 'text-[#7F1D1D]',
    surfaceColorClass: 'bg-[#FEF2F2] border-[#F87171]',
    dotColorHex: '#7F1D1D',
  };
}

/**
 * Finds the lowest-PM2.5 contiguous 2-hour daytime airing window (10:00–17:00)
 * when winter solar heating weakens the cold-air thermal inversion cap.
 */
export function findBestVentilationWindow(hourlyCurve: HourlyAirPoint[]): {
  startHour: number;
  endHour: number;
  label: string;
  avgPm25: number;
} {
  if (!hourlyCurve.length) {
    return { startHour: 13, endHour: 15, label: '13:00 – 15:00', avgPm25: 0 };
  }

  const daytime = hourlyCurve.filter((pt) => pt.hour >= 10 && pt.hour <= 16);
  const candidates = daytime.length >= 2 ? daytime : hourlyCurve;

  let bestIndex = 0;
  let bestAvg = Number.POSITIVE_INFINITY;

  for (let i = 0; i < candidates.length - 1; i++) {
    const avg = (candidates[i].pm25 + candidates[i + 1].pm25) / 2;
    if (avg < bestAvg) {
      bestAvg = avg;
      bestIndex = i;
    }
  }

  const start = candidates[bestIndex];
  const endHour = (start.hour + 2) % 24;
  const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

  return {
    startHour: start.hour,
    endHour,
    label: `${formatHour(start.hour)} – ${formatHour(endHour)}`,
    avgPm25: Math.round(bestAvg),
  };
}

/**
 * Estimates indoor PM2.5 (µg/m³) from outdoor winter smog infiltration,
 * building tightness, indoor cooking combustion, and active filtration/sealing hacks.
 * Uses multiplicative independent retention factors so stacked hacks remain physically realistic.
 */
export function estimateIndoorPm25(
  outdoorPm25: number,
  building: HouseholdProfile['building'],
  cooking: HouseholdProfile['cooking'],
  activeHackIds: string[],
  allHacks: IndoorHack[],
  isCookingActive = false
): IndoorAirEstimate {
  const safeOutdoor = Math.max(5, outdoorPm25);

  // Typical residential infiltration factor (F_inf) during winter closed-window conditions
  const infiltrationMap: Record<HouseholdProfile['building'], number> = {
    older_drafty: 0.72,
    detached_home: 0.62,
    apartment_midrise: 0.56,
    modern_insulated: 0.44,
  };
  const infiltration = infiltrationMap[building] ?? 0.6;

  // Indoor combustion spike when cooking without mitigation
  let cookingContribution = 0;
  if (isCookingActive) {
    if (cooking === 'biomass_solid') cookingContribution = 85;
    else if (cooking === 'gas_stove') cookingContribution = 32;
    else if (cooking === 'electric_coil') cookingContribution = 14;
    else cookingContribution = 8; // induction still generates oil aerosol if unvented
  } else {
    // Residual daily background from indoor sources
    cookingContribution = cooking === 'biomass_solid' ? 18 : cooking === 'gas_stove' ? 7 : 3;
  }

  const baselineIndoorPm25 = Math.round(safeOutdoor * infiltration + cookingContribution);

  const activeSet = new Set(activeHackIds);
  const activeHacks = allHacks.filter((h) => activeSet.has(h.id));

  let retention = 1;
  for (const hack of activeHacks) {
    const clampedFactor = Math.min(0.6, Math.max(0, hack.pm25ReductionFactor));
    retention *= 1 - clampedFactor;
  }

  // Floor at 6 µg/m³ (real-world residential floor during severe winter smog)
  const rawMitigated = baselineIndoorPm25 * retention;
  const mitigatedIndoorPm25 = Math.max(
    Math.min(baselineIndoorPm25, 6),
    Math.round(rawMitigated)
  );

  const reductionPercent =
    baselineIndoorPm25 > 0
      ? Math.max(
          0,
          Math.min(95, Math.round(((baselineIndoorPm25 - mitigatedIndoorPm25) / baselineIndoorPm25) * 100))
        )
      : 0;

  return {
    baselineIndoorPm25,
    mitigatedIndoorPm25,
    reductionPercent,
    whoMultiple: Number((mitigatedIndoorPm25 / WHO_24H_PM25_GUIDELINE).toFixed(1)),
    activeCount: activeHacks.length,
  };
}

/**
 * Aggregates direct environmental and exposure impact of selected sustainable swaps
 * across both a single household and the configured neighborhood/community scale.
 */
export function computeSwapImpact(
  swaps: SustainableSwap[],
  selectedIds: string[],
  householdSize: number,
  communityHomes: number
): SwapImpactTotals {
  const selectedSet = new Set(selectedIds);
  const active = swaps.filter((s) => selectedSet.has(s.id));
  const safeCommunity = Math.max(1, Math.round(communityHomes));
  const sizeFactor = 1 + Math.max(0, householdSize - 2) * 0.14;

  let weeklyCo2 = 0;
  let dailyPm25Grams = 0;
  let combinedRetention = 1;

  for (const swap of active) {
    weeklyCo2 += swap.weeklyCo2Kg * sizeFactor;
    dailyPm25Grams += swap.dailyPm25GramsAvoided * sizeFactor;
    combinedRetention *= 1 - Math.min(0.4, swap.exposureReductionPct / 100);
  }

  const householdWeeklyCo2Kg = Number(weeklyCo2.toFixed(1));
  const householdSeasonCo2Kg = Math.round(weeklyCo2 * WINTER_SEASON_WEEKS);
  const householdSeasonPm25Grams = Math.round(dailyPm25Grams * WINTER_SEASON_DAYS);
  const householdExposureReductionPct = Math.round((1 - combinedRetention) * 100);

  const communitySeasonCo2Tons = Number(
    ((householdSeasonCo2Kg * safeCommunity) / 1000).toFixed(2)
  );
  const communitySeasonPm25Kg = Number(
    ((householdSeasonPm25Grams * safeCommunity) / 1000).toFixed(2)
  );

  // Average 10 km urban cold-start winter car round-trip emits ~2.4 kg CO2e
  const equivalentCarTripsAvoided = Math.round((householdSeasonCo2Kg * safeCommunity) / 2.4);

  return {
    selectedCount: active.length,
    householdWeeklyCo2Kg,
    householdSeasonCo2Kg,
    householdSeasonPm25Grams,
    householdExposureReductionPct,
    communitySeasonCo2Tons,
    communitySeasonPm25Kg,
    equivalentCarTripsAvoided,
  };
}

/**
 * Generates an immediate deterministic daily routine tailored to the user's
 * current HouseholdProfile and local thermal inversion curve.
 */
export function generateProfileRoutine(
  profile: HouseholdProfile,
  hourlyCurve: HourlyAirPoint[]
): RoutineBlock[] {
  const ventWindow = findBestVentilationWindow(hourlyCurve);
  const severeSmog = profile.currentAqi >= 151;
  const hasChildren = profile.sensitivities.includes('children');
  const hasAsthma = profile.sensitivities.includes('asthma_respiratory');

  const morningMobilityAction =
    profile.commute === 'solo_car' || profile.commute === 'diesel_commute'
      ? `Replace cold-start solo driving in ${profile.city} with transit, carpool, or a combined errand loop; pre-cabin recirculate if driving is unavoidable.`
      : profile.commute === 'walk_cycle'
        ? `Route morning walk or ride two blocks off arterial roads and wear a well-sealed FFP2/N95 mask while morning inversion PM2.5 sits near ${profile.outdoorPm25} µg/m³.`
        : `Keep morning transit transfers brief and avoid idling bus bays; use indoor warm-up instead of brisk outdoor cardio before 10:00.`;

  const heatingAction =
    profile.heating === 'wood_coal'
      ? `Suspend solid-fuel burning during the evening inversion lock-in. Use electric spot-heating in the main family room and seal unheated rooms after 17:00.`
      : profile.heating === 'gas_furnace'
        ? `Lower overnight thermostat by 2 °C (to 18–19 °C), bleed radiators for efficient heat transfer, and verify MERV-13 furnace filter seating.`
        : `Shift high-draw heating pre-warming to midday off-peak solar hours and hold steady evening indoor temperatures without supplemental wood fires.`;

  const cookingNote =
    profile.cooking === 'gas_stove' || profile.cooking === 'biomass_solid'
      ? `Cook dinner on rear burners with an externally vented range hood running 15 minutes past shutoff, or use an electric kettle, rice cooker, or slow cooker.`
      : `Cover simmering pots with lids and run the kitchen extractor on medium to capture cooking oil aerosols before bedtime.`;

  const sensitiveNote =
    hasChildren || hasAsthma
      ? ' Prioritize a dedicated clean-air bedroom (HEPA on medium) 1 hour before sleep for vulnerable family members.'
      : '';

  return [
    {
      id: 'morning-seal',
      timeWindow: '06:30 – 09:30',
      phase: 'Morning',
      title: severeSmog ? 'Morning Inversion Shield & Low-Emission Departure' : 'Low-Emission Morning Start',
      action: morningMobilityAction,
      directImpact:
        'Cold-engine winter starts release up to 5× more unburned fine particulates and NO₂ in the first 3 km—precisely when the cold-air inversion lid traps exhaust at breathing height.',
      emissionSavedLabel: profile.commute === 'solo_car' || profile.commute === 'diesel_commute' ? '-2.6 kg CO₂e / day' : '-0.8 kg CO₂e / day',
      exposureDeltaLabel: '-45% commute PM2.5 dose',
    },
    {
      id: 'midday-vent',
      timeWindow: ventWindow.label,
      phase: 'Midday',
      title: 'Brief Solar-Break Air Exchange',
      action: `Open opposite windows wide for 8–10 minutes during the ${ventWindow.label} dip (est. ${ventWindow.avgPm25} µg/m³) to flush indoor CO₂ and moisture, then close and run filtration on high for 20 minutes.`,
      directImpact:
        'Short cross-ventilation during the midday inversion minimum clears stale CO₂ and indoor VOCs without soaking walls in peak-smog particulates or wasting thermal mass.',
      emissionSavedLabel: 'Preserves 12% heating energy',
      exposureDeltaLabel: '-35% indoor CO₂ buildup',
    },
    {
      id: 'afternoon-activity',
      timeWindow: '15:30 – 18:00',
      phase: 'Afternoon',
      title: hasChildren ? 'Clean-Air After-School & Errand Consolidation' : 'Pre-Dusk Errand Consolidation',
      action: `Finish outdoor errands and school pickups before sunset radiational cooling locks the evening inversion layer. Move vigorous physical activity into a filtered indoor space.${sensitiveNote}`,
      directImpact:
        'Vigorous breathing increases fine-particle lung deposition 3–4×. Shifting exertion indoors before evening rush-hour emissions spike prevents acute airway inflammation.',
      emissionSavedLabel: '-1.4 kg CO₂e via trip chaining',
      exposureDeltaLabel: '-52% peak inhalation load',
    },
    {
      id: 'evening-heat-cook',
      timeWindow: '18:00 – 22:30',
      phase: 'Evening',
      title: 'Zero-Smoke Evening Heating & Clean Cooking',
      action: `${heatingAction} ${cookingNote}`,
      directImpact:
        'Residential wood/coal combustion and unvented gas cooking are the #1 preventable spikes in nighttime neighborhood PM2.5 and indoor NO₂ during winter stagnation.',
      emissionSavedLabel: profile.heating === 'wood_coal' ? '-48 g local PM2.5 / night' : '-1.9 kg CO₂e / night',
      exposureDeltaLabel: '-60% bedroom PM2.5 overnight',
    },
  ];
}

export interface ProfileValidationErrors {
  city?: string;
  currentAqi?: string;
  householdSize?: string;
  communityHomes?: string;
}

export function validateProfileInput(input: {
  city: string;
  currentAqi: number;
  householdSize: number;
  communityHomes: number;
}): { valid: boolean; errors: ProfileValidationErrors } {
  const errors: ProfileValidationErrors = {};

  if (!input.city || input.city.trim().length < 2) {
    errors.city = 'Enter a city or neighborhood name (at least 2 characters).';
  }
  if (!Number.isFinite(input.currentAqi) || input.currentAqi < 0 || input.currentAqi > 500) {
    errors.currentAqi = 'AQI must be a number between 0 and 500.';
  }
  if (!Number.isFinite(input.householdSize) || input.householdSize < 1 || input.householdSize > 25) {
    errors.householdSize = 'Household size must be between 1 and 25 people.';
  }
  if (!Number.isFinite(input.communityHomes) || input.communityHomes < 1 || input.communityHomes > 10000) {
    errors.communityHomes = 'Community size must be between 1 and 10,000 homes.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateCustomHackPrompt(prompt: string): string | null {
  const trimmed = prompt.trim();
  if (trimmed.length < 10) {
    return 'Describe your home setup or air challenge in at least 10 characters (e.g., drafty windows and a gas stove).';
  }
  if (trimmed.length > 500) {
    return 'Please keep your home challenge under 500 characters.';
  }
  return null;
}

export function aqiToEstimatedPm25(aqi: number): number {
  const clamped = Math.max(0, Math.min(500, aqi));
  if (clamped <= 50) return Math.round((clamped / 50) * 12);
  if (clamped <= 100) return Math.round(12 + ((clamped - 50) / 50) * 23.4);
  if (clamped <= 150) return Math.round(35.4 + ((clamped - 100) / 50) * 20);
  if (clamped <= 200) return Math.round(55.4 + ((clamped - 150) / 50) * 95);
  if (clamped <= 300) return Math.round(150.4 + ((clamped - 200) / 100) * 100);
  return Math.round(250.4 + ((clamped - 300) / 200) * 250);
}

export function scaleCurveToPm25(preset: CityPreset, targetPm25: number): HourlyAirPoint[] {
  const basePeak = Math.max(1, preset.typicalPm25);
  const ratio = Math.max(0.15, targetPm25 / basePeak);
  return preset.hourlyCurve.map((pt) => ({
    ...pt,
    pm25: Math.max(6, Math.round(pt.pm25 * ratio)),
  }));
}

/**
 * Determines whether a sustainable swap directly targets a primary emission source
 * or health sensitivity in the household's active profile.
 */
export function isSwapTailoredToProfile(
  swap: Pick<SustainableSwap, 'id'>,
  profile: Pick<HouseholdProfile, 'heating' | 'commute' | 'cooking' | 'sensitivities'>
): boolean {
  if (swap.id === 'swap-no-wood-burn' && profile.heating === 'wood_coal') return true;
  if (
    (swap.id === 'swap-thermostat-setback' || swap.id === 'swap-heat-pump-transition') &&
    (profile.heating === 'gas_furnace' || profile.heating === 'wood_coal')
  ) {
    return true;
  }
  if (
    (swap.id === 'swap-cold-start-transit' || swap.id === 'swap-trip-chaining') &&
    (profile.commute === 'solo_car' || profile.commute === 'diesel_commute')
  ) {
    return true;
  }
  if (
    swap.id === 'swap-electric-countertop' &&
    (profile.cooking === 'gas_stove' || profile.cooking === 'biomass_solid')
  ) {
    return true;
  }
  if (swap.id === 'swap-zero-idle-zone' && profile.sensitivities.includes('children')) {
    return true;
  }
  return false;
}

/**
 * Sorts sustainable swaps so profile-matched actions appear first while preserving relative order.
 */
export function sortSwapsForProfile(
  swaps: SustainableSwap[],
  profile: Pick<HouseholdProfile, 'heating' | 'commute' | 'cooking' | 'sensitivities'>
): SustainableSwap[] {
  return [...swaps].sort(
    (a, b) =>
      Number(isSwapTailoredToProfile(b, profile)) - Number(isSwapTailoredToProfile(a, profile))
  );
}

