import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, AlertCircle, Flame } from 'lucide-react';
import type { HouseholdProfile, IndoorAirEstimate, IndoorHack } from '../types/air';
import { validateCustomHackPrompt } from '../utils/airImpact';

interface IndoorAirViewProps {
  profile: HouseholdProfile;
  hacks: IndoorHack[];
  activeHackIds: string[];
  onToggleHack: (id: string) => void;
  isCookingActive: boolean;
  onToggleCooking: () => void;
  indoorEstimate: IndoorAirEstimate;
  onGenerateCustomHack: (challenge: string) => Promise<void>;
  isGeneratingHack: boolean;
  customHackError: string | null;
}

const CATEGORIES: Array<'All' | IndoorHack['category']> = [
  'All',
  'Filtration',
  'Room Sealing',
  'Source Control',
  'Ventilation',
];

export function IndoorAirView({
  profile,
  hacks,
  activeHackIds,
  onToggleHack,
  isCookingActive,
  onToggleCooking,
  indoorEstimate,
  onGenerateCustomHack,
  isGeneratingHack,
  customHackError,
}: IndoorAirViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<'All' | IndoorHack['category']>('All');
  const [expandedIds, setExpandedIds] = useState<string[]>(['corsi-rosenthal']);
  const [challengeInput, setChallengeInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeSet = useMemo(() => new Set(activeHackIds), [activeHackIds]);
  const filteredHacks = useMemo(
    () =>
      selectedCategory === 'All'
        ? hacks
        : hacks.filter((h) => h.category === selectedCategory),
    [hacks, selectedCategory]
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmitCustomHack = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateCustomHackPrompt(challengeInput);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    await onGenerateCustomHack(challengeInput.trim());
    setChallengeInput('');
  };

  const maxBar = Math.max(profile.outdoorPm25, indoorEstimate.baselineIndoorPm25, 40);
  const outdoorWidth = Math.min(100, Math.round((profile.outdoorPm25 / maxBar) * 100));
  const baselineWidth = Math.min(100, Math.round((indoorEstimate.baselineIndoorPm25 / maxBar) * 100));
  const mitigatedWidth = Math.min(100, Math.round((indoorEstimate.mitigatedIndoorPm25 / maxBar) * 100));

  return (
    <div className="space-y-8">
      {/* Indoor Air Quality Simulator Header */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-xs text-slate-500">
              Indoor Air Quality Lab · {profile.city} · Building: {profile.building.replace('_', ' ')}
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              Practical Indoor Air Quality Hacks
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Toggle the low-cost filtration, sealing, and source-control practices active in your home to model real-time indoor PM2.5 levels during severe winter inversions.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isCookingActive}
            onClick={onToggleCooking}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isCookingActive
                ? 'bg-[#FFF7ED] border-[#FDBA74] text-[#9A3412]'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Flame className="w-4 h-4" aria-hidden="true" />
            <span>{isCookingActive ? 'Simulating Active Cooking' : 'Simulate Dinner Cooking Spike'}</span>
          </button>
        </div>

        {/* Comparison Bars + Tabular Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 border-t border-slate-100 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 font-medium">Outdoor street air</span>
                <span className="font-mono font-semibold tabular-nums text-slate-800">
                  {profile.outdoorPm25} µg/m³
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-500 rounded-full transition-all duration-200"
                  style={{ width: `${outdoorWidth}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 font-medium">
                  Unmitigated indoor air {isCookingActive ? '(with stove running)' : '(closed windows only)'}
                </span>
                <span className="font-mono font-semibold tabular-nums text-[#C2410C]">
                  {indoorEstimate.baselineIndoorPm25} µg/m³
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#D97706] rounded-full transition-all duration-200"
                  style={{ width: `${baselineWidth}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-900 font-semibold">
                  Your indoor air with {indoorEstimate.activeCount} active hack
                  {indoorEstimate.activeCount === 1 ? '' : 's'}
                </span>
                <span
                  className="font-mono font-semibold tabular-nums text-[#0F766E]"
                  data-testid="indoor-pm25-value"
                >
                  {indoorEstimate.mitigatedIndoorPm25} µg/m³
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0F766E] rounded-full transition-all duration-200"
                  style={{ width: `${mitigatedWidth}%` }}
                />
              </div>
            </div>
          </div>

          <div
            aria-live="polite"
            className="lg:col-span-5 lg:border-l lg:border-slate-100 lg:pl-6 grid grid-cols-2 gap-4"
          >
            <div>
              <div className="text-xs text-slate-500">Indoor PM2.5 Reduction</div>
              <div
                className="mt-1 font-mono text-3xl font-semibold tabular-nums text-[#0F766E]"
                data-testid="indoor-reduction-pct"
              >
                -{indoorEstimate.reductionPercent}%
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {indoorEstimate.activeCount} of {hacks.length} hacks active
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">vs. WHO 24h Guideline</div>
              <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-slate-900">
                {indoorEstimate.whoMultiple}×
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {indoorEstimate.whoMultiple <= 1.2
                  ? 'Near WHO clean-air target (15 µg/m³)'
                  : 'Target ≤ 1.0× (15 µg/m³) in bedrooms'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Bar + Hack List */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={selectedCategory === category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === category
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Showing {filteredHacks.length} protocol{filteredHacks.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {filteredHacks.map((hack) => {
            const isActive = activeSet.has(hack.id);
            const isExpanded = expandedIds.includes(hack.id);
            return (
              <article
                key={hack.id}
                className={`bg-white rounded-xl border transition-colors p-5 flex flex-col justify-between ${
                  isActive ? 'border-[#0F766E]/60' : 'border-slate-200/90'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span>{hack.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{hack.costLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{hack.setupTime}</span>
                        {hack.isCustomAi && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#0F766E] font-medium">Custom AI</span>
                          </>
                        )}
                      </div>
                      <h2 className="text-base font-semibold text-slate-900">{hack.title}</h2>
                    </div>

                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isActive}
                      aria-label={`Activate indoor hack: ${hack.title}`}
                      onClick={() => onToggleHack(hack.id)}
                      className={`mt-0.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-[#0F766E] border-[#0F766E] text-white'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-[#0F766E]'
                      }`}
                    >
                      {isActive && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      <span>{isActive ? 'Active' : 'Enable'}</span>
                    </button>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">{hack.summary}</p>

                  <div className="text-xs text-slate-700 leading-relaxed pt-2 border-t border-slate-100">
                    <span className="font-semibold text-slate-900">Direct lung impact: </span>
                    {hack.mechanism}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-[#0F766E] tabular-nums">
                      Up to -{Math.round(hack.pm25ReductionFactor * 100)}% indoor PM2.5
                    </span>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpand(hack.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide steps' : 'How to set up'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <ol className="mt-3 space-y-2 text-xs text-slate-700 list-decimal list-inside">
                      {hack.steps.map((step, i) => (
                        <li key={i} className="leading-relaxed">
                          {step}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* GenAI Custom Indoor Hack Designer */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">
            Generate a Custom Indoor Air Hack for Your Home
          </h2>
          <p className="text-sm text-slate-600">
            Describe a tricky room, drafty rental window, basement boiler, or budget constraint and ClearWinter AI will design a tailored protocol and add it to your simulator.
          </p>
        </div>

        <form onSubmit={handleSubmitCustomHack} noValidate className="space-y-3">
          <div>
            <label htmlFor="custom-hack-challenge" className="block text-xs font-medium text-slate-700 mb-1.5">
              Describe your indoor air challenge
            </label>
            <textarea
              id="custom-hack-challenge"
              rows={2}
              value={challengeInput}
              aria-invalid={Boolean(validationError)}
              aria-describedby={validationError ? 'custom-hack-error' : undefined}
              onChange={(e) => {
                setChallengeInput(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="Example: 1960s third-floor apartment with single-pane bedroom windows, a gas range without an outside vent, and a toddler with mild winter cough."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15"
            />
            {validationError && (
              <p id="custom-hack-error" role="alert" className="mt-1.5 text-xs text-[#B91C1C]">
                {validationError}
              </p>
            )}
          </div>

          {customHackError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{customHackError}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              Tailored using your active profile ({profile.city}, AQI {profile.currentAqi})
            </span>
            <button
              type="submit"
              disabled={isGeneratingHack}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{isGeneratingHack ? 'Designing Hack…' : 'Create Custom Hack'}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
