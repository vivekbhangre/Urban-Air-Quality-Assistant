import { useMemo, useState } from 'react';
import { Check, Users } from 'lucide-react';
import type {
  HouseholdProfile,
  SustainableSwap,
  SwapCategory,
  SwapImpactTotals,
} from '../types/air';

interface SustainableSwapsViewProps {
  profile: HouseholdProfile;
  swaps: SustainableSwap[];
  selectedSwapIds: string[];
  onToggleSwap: (id: string) => void;
  onUpdateCommunityHomes: (homes: number) => void;
  totals: SwapImpactTotals;
}

const CATEGORIES: Array<'All' | SwapCategory> = [
  'All',
  'Heating',
  'Mobility',
  'Cooking',
  'Community',
];

const COMMUNITY_SCALES = [1, 25, 100, 500];

function isSwapTailoredToProfile(swap: SustainableSwap, profile: HouseholdProfile): boolean {
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

export function SustainableSwapsView({
  profile,
  swaps,
  selectedSwapIds,
  onToggleSwap,
  onUpdateCommunityHomes,
  totals,
}: SustainableSwapsViewProps) {
  const [category, setCategory] = useState<'All' | SwapCategory>('All');
  const selectedSet = useMemo(() => new Set(selectedSwapIds), [selectedSwapIds]);

  const filteredSwaps = useMemo(() => {
    const base = category === 'All' ? swaps : swaps.filter((s) => s.category === category);
    return [...base].sort(
      (a, b) =>
        Number(isSwapTailoredToProfile(b, profile)) - Number(isSwapTailoredToProfile(a, profile))
    );
  }, [category, swaps, profile]);

  return (
    <div className="space-y-8">
      {/* Impact Calculator Overview */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-xs text-slate-500">
              Direct Choice Impact · {profile.city} · {profile.householdSize}-person household
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              Sustainable Alternatives & Community Impact
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Select realistic winter heating, mobility, cooking, and neighborhood habits to see how your household choices directly cut fine smog particulates and scale across your community over a 90-day winter.
            </p>
          </div>

          <div className="shrink-0 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Users className="w-3.5 h-3.5 text-[#0F766E]" aria-hidden="true" />
              <span>Community Scale Multiplier</span>
            </div>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {COMMUNITY_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  aria-pressed={profile.communityHomes === scale}
                  onClick={() => onUpdateCommunityHomes(scale)}
                  className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    profile.communityHomes === scale
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {scale === 1 ? '1 home' : `${scale} homes`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Household vs Community Metric Grid */}
        <div
          aria-live="polite"
          className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <div>
            <div className="text-xs text-slate-500">Your Household · Weekly CO₂e</div>
            <div
              className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900"
              data-testid="household-weekly-co2"
            >
              {totals.householdWeeklyCo2Kg} kg
            </div>
            <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
              {totals.householdSeasonCo2Kg} kg CO₂e / 90-day winter
            </div>
          </div>

          <div className="md:border-l md:border-slate-100 md:pl-6">
            <div className="text-xs text-slate-500">Your Household · Local PM2.5 Prevented</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#0F766E]">
              {totals.householdSeasonPm25Grams} g
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Est. -{totals.householdExposureReductionPct}% household smog exposure
            </div>
          </div>

          <div className="lg:border-l lg:border-slate-100 lg:pl-6">
            <div className="text-xs text-slate-500">
              Community ({profile.communityHomes} homes) · Winter PM2.5
            </div>
            <div
              className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#0F766E]"
              data-testid="community-pm25-kg"
            >
              {totals.communitySeasonPm25Kg} kg
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Direct fine soot kept out of local winter air
            </div>
          </div>

          <div className="md:border-l md:border-slate-100 md:pl-6">
            <div className="text-xs text-slate-500">
              Community ({profile.communityHomes} homes) · Winter CO₂e
            </div>
            <div
              className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900"
              data-testid="community-co2-tons"
            >
              {totals.communitySeasonCo2Tons} t
            </div>
            <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
              ≈ {totals.equivalentCarTripsAvoided.toLocaleString()} cold-start car trips
            </div>
          </div>
        </div>

        {/* Fine-tune slider */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <label
            htmlFor="community-homes-slider"
            className="text-xs font-medium text-slate-700 whitespace-nowrap shrink-0"
          >
            Neighborhood participation ({profile.communityHomes}{' '}
            {profile.communityHomes === 1 ? 'household' : 'households'})
          </label>
          <input
            id="community-homes-slider"
            type="range"
            min={1}
            max={500}
            step={1}
            value={Math.min(500, profile.communityHomes)}
            onChange={(e) => onUpdateCommunityHomes(Number(e.target.value))}
            className="w-full accent-[#0F766E] cursor-pointer"
          />
          <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
            {totals.selectedCount} swap{totals.selectedCount === 1 ? '' : 's'} active
          </span>
        </div>
      </section>

      {/* Filter bar + empty notice if zero swaps selected */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                category === item
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {totals.selectedCount === 0
            ? 'Select one or more swaps below to model your winter impact.'
            : `${totals.selectedCount} committed swap${totals.selectedCount === 1 ? '' : 's'} included in totals`}
        </span>
      </div>

      {/* Swaps List */}
      <div className="bg-white border border-slate-200/90 rounded-xl divide-y divide-slate-100">
        {filteredSwaps.map((swap) => {
          const isSelected = selectedSet.has(swap.id);
          const isTailoredMatch = isSwapTailoredToProfile(swap, profile);
          return (
            <article key={swap.id} className="p-5 sm:p-6 transition-colors hover:bg-slate-50/50">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Commit to sustainable swap: ${swap.title}`}
                    onClick={() => onToggleSwap(swap.id)}
                    className={`mt-1 w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#0F766E] border-[#0F766E] text-white'
                        : 'bg-white border-slate-300 text-transparent hover:border-[#0F766E]'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>

                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{swap.category}</span>
                      {isTailoredMatch && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-[#0F766E]">Matches your home setup</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>Replaces: {swap.replaces}</span>
                      <span aria-hidden="true">·</span>
                      <span>Effort: {swap.effortLevel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{swap.costNote}</span>
                    </div>

                    <h2 className="text-base font-semibold text-slate-900">{swap.title}</h2>

                    <p className="text-sm text-slate-700 leading-relaxed">
                      <span className="font-semibold text-slate-900">Direct impact: </span>
                      {swap.directImpactExplanation}
                    </p>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      <span className="font-medium text-slate-800">At community scale: </span>
                      {swap.communityMultiplierNote}
                    </p>
                  </div>
                </div>

                <div className="md:w-48 shrink-0 md:text-right pl-10 md:pl-0 md:border-l md:border-slate-100 md:pl-5 space-y-1">
                  <div className="font-mono text-sm font-semibold tabular-nums text-[#0F766E]">
                    -{swap.dailyPm25GramsAvoided} g PM2.5 / day
                  </div>
                  <div className="font-mono text-xs text-slate-700 tabular-nums">
                    -{swap.weeklyCo2Kg} kg CO₂e / week
                  </div>
                  <div className="font-mono text-xs text-slate-500 tabular-nums">
                    -{swap.exposureReductionPct}% inhalation dose
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
