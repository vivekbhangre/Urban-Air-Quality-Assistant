export type HeatingType =
  | 'wood_coal'
  | 'gas_furnace'
  | 'district_heating'
  | 'heat_pump'
  | 'electric_space';

export type CommuteMode =
  | 'solo_car'
  | 'diesel_commute'
  | 'public_transit'
  | 'walk_cycle'
  | 'hybrid_remote';

export type CookingType = 'gas_stove' | 'induction' | 'electric_coil' | 'biomass_solid';

export type BuildingType = 'older_drafty' | 'modern_insulated' | 'apartment_midrise' | 'detached_home';

export type SensitivityGroup = 'children' | 'older_adults' | 'asthma_respiratory' | 'outdoor_workers';

export type NavigationTab = 'routine' | 'indoor' | 'swaps' | 'advisor' | 'profile';

export interface HouseholdProfile {
  city: string;
  regionLabel: string;
  currentAqi: number;
  outdoorPm25: number;
  householdSize: number;
  communityHomes: number;
  heating: HeatingType;
  commute: CommuteMode;
  cooking: CookingType;
  building: BuildingType;
  sensitivities: SensitivityGroup[];
}

export interface HourlyAirPoint {
  hour: number;
  label: string;
  pm25: number;
  inversionActive: boolean;
}

export interface CityPreset {
  id: string;
  city: string;
  regionLabel: string;
  typicalWinterAqi: number;
  typicalPm25: number;
  inversionPattern: string;
  primarySources: string[];
  hourlyCurve: HourlyAirPoint[];
}

export interface RoutineBlock {
  id: string;
  timeWindow: string;
  phase: 'Morning' | 'Midday' | 'Afternoon' | 'Evening';
  title: string;
  action: string;
  directImpact: string;
  emissionSavedLabel: string;
  exposureDeltaLabel: string;
  isAiTailored?: boolean;
}

export interface IndoorHack {
  id: string;
  title: string;
  category: 'Filtration' | 'Ventilation' | 'Source Control' | 'Room Sealing';
  costLabel: string;
  setupTime: string;
  pm25ReductionFactor: number; // fractional reduction of indoor PM2.5 (0 to 0.6)
  summary: string;
  mechanism: string;
  steps: string[];
  isCustomAi?: boolean;
}

export type SwapCategory = 'Heating' | 'Mobility' | 'Cooking' | 'Community';

export interface SustainableSwap {
  id: string;
  title: string;
  category: SwapCategory;
  replaces: string;
  weeklyCo2Kg: number;
  dailyPm25GramsAvoided: number;
  exposureReductionPct: number;
  effortLevel: 'Low' | 'Moderate' | 'Community-Led';
  costNote: string;
  directImpactExplanation: string;
  communityMultiplierNote: string;
  isAiTailored?: boolean;
}

export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  impactSummary?: string[];
  isError?: boolean;
}

export interface TailoredPlanResponse {
  inversionBrief: string;
  routineBlocks: Omit<RoutineBlock, 'isAiTailored'>[];
  priorityIndoorTips: string[];
  topSwapSpotlight: {
    title: string;
    replaces: string;
    directImpactExplanation: string;
    weeklyCo2Kg: number;
    dailyPm25GramsAvoided: number;
  };
}

export interface AqiClassification {
  label: 'Good' | 'Moderate' | 'Unhealthy for Sensitive' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';
  shortAdvice: string;
  textColorClass: string;
  surfaceColorClass: string;
  dotColorHex: string;
}

export interface IndoorAirEstimate {
  baselineIndoorPm25: number;
  mitigatedIndoorPm25: number;
  reductionPercent: number;
  whoMultiple: number;
  activeCount: number;
}

export interface SwapImpactTotals {
  selectedCount: number;
  householdWeeklyCo2Kg: number;
  householdSeasonCo2Kg: number;
  householdSeasonPm25Grams: number;
  householdExposureReductionPct: number;
  communitySeasonCo2Tons: number;
  communitySeasonPm25Kg: number;
  equivalentCarTripsAvoided: number;
}
