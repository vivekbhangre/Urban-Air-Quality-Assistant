import { Check, RefreshCw, ArrowRight, AlertCircle, Wind } from 'lucide-react';
import type {
  AqiClassification,
  HourlyAirPoint,
  HouseholdProfile,
  IndoorAirEstimate,
  NavigationTab,
  RoutineBlock,
  SwapImpactTotals,
  TailoredPlanResponse,
} from '../types/air';
import { findBestVentilationWindow } from '../utils/airImpact';
import { InversionChart } from './InversionChart';

interface DailyRoutineViewProps {
  profile: HouseholdProfile;
  aqiInfo: AqiClassification;
  hourlyCurve: HourlyAirPoint[];
  inversionPattern: string;
  routineBlocks: RoutineBlock[];
  completedRoutineIds: string[];
  onToggleRoutineComplete: (id: string) => void;
  indoorEstimate: IndoorAirEstimate;
  swapTotals: SwapImpactTotals;
  aiPlan: TailoredPlanResponse | null;
  isTailoring: boolean;
  tailorError: string | null;
  onTailorWithAi: () => void;
  onNavigate: (tab: NavigationTab) => void;
}

export function DailyRoutineView({
  profile,
  aqiInfo,
  hourlyCurve,
  inversionPattern,
  routineBlocks,
  completedRoutineIds,
  onToggleRoutineComplete,
  indoorEstimate,
  swapTotals,
  aiPlan,
  isTailoring,
  tailorError,
  onTailorWithAi,
  onNavigate,
}: DailyRoutineViewProps) {
  const ventWindow = findBestVentilationWindow(hourlyCurve);
  const completedSet = new Set(completedRoutineIds);
  const completedCount = routineBlocks.filter((b) => completedSet.has(b.id)).length;

  return (
    <div className="space-y-8">
      {/* Hero Summary Band */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{profile.city}</span>
              <span aria-hidden="true">·</span>
              <span>{profile.regionLabel}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-semibold ${aqiInfo.textColorClass}`}>
                {aqiInfo.label} (AQI {profile.currentAqi})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              Low-Emission Daily Routine & Inversion Plan
            </h1>
            <p className="text-sm sm:text-[15px] leading-relaxed text-slate-600">
              {aiPlan?.inversionBrief || inversionPattern}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onTailorWithAi}
              disabled={isTailoring}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isTailoring ? 'animate-spin' : ''}`} />
              <span>{isTailoring ? 'Tailoring Plan…' : aiPlan ? 'Refresh AI Plan' : 'Tailor Plan with AI'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('advisor')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Ask Air Advisor</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error state for AI tailoring */}
        {tailorError && (
          <div
            role="alert"
            className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{tailorError}</span>
            </div>
            <button
              type="button"
              onClick={onTailorWithAi}
              className="px-3 py-1.5 text-xs font-medium text-[#991B1B] bg-white border border-[#FCA5A5] rounded-md hover:bg-[#FEE2E2] whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {/* 4-column KPI strip separated by clean hairlines */}
        <div className="mt-7 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-slate-500">Outdoor Winter Smog</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {profile.outdoorPm25}
              </span>
              <span className="text-xs font-mono text-slate-500">µg/m³ PM2.5</span>
            </div>
            <p className={`mt-1 text-xs font-medium ${aqiInfo.textColorClass}`}>
              AQI {profile.currentAqi} · {aqiInfo.label}
            </p>
          </div>

          <div className="sm:border-l sm:border-slate-100 sm:pl-6">
            <div className="text-xs text-slate-500">Estimated Indoor PM2.5</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums text-[#0F766E]">
                {indoorEstimate.mitigatedIndoorPm25}
              </span>
              <span className="text-xs font-mono text-slate-500">µg/m³</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('indoor')}
              className="mt-1 text-left text-xs text-slate-600 hover:text-[#0F766E] underline underline-offset-2 cursor-pointer"
            >
              {indoorEstimate.reductionPercent}% cut via {indoorEstimate.activeCount} active hacks
            </button>
          </div>

          <div className="lg:border-l lg:border-slate-100 lg:pl-6">
            <div className="text-xs text-slate-500">Safest Airing Window</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
              {ventWindow.label}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Inversion dip near {ventWindow.avgPm25} µg/m³ · Air 8–10 min
            </p>
          </div>

          <div className="sm:border-l sm:border-slate-100 sm:pl-6">
            <div className="text-xs text-slate-500">Committed Weekly Savings</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
                {swapTotals.householdWeeklyCo2Kg}
              </span>
              <span className="text-xs font-mono text-slate-500">kg CO₂e / wk</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('swaps')}
              className="mt-1 text-left text-xs text-slate-600 hover:text-[#0F766E] underline underline-offset-2 cursor-pointer"
            >
              {swapTotals.communitySeasonPm25Kg} kg PM2.5 avoided across {profile.communityHomes} homes
            </button>
          </div>
        </div>
      </section>

      {/* Main Split: 24h Inversion Curve + Daily Routine Schedule */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Hourly Thermal Inversion Chart + Guidance */}
        <div className="xl:col-span-5 space-y-6">
          <section className="bg-white border border-slate-200/90 rounded-xl p-6">
            <InversionChart
              points={hourlyCurve}
              ventilationStartHour={ventWindow.startHour}
              ventilationEndHour={ventWindow.endHour}
              city={profile.city}
            />
          </section>

          <section className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {aiPlan ? 'AI-Tailored Indoor Priorities' : 'Immediate Exposure Guardrails'}
              </h2>
              <Wind className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{aqiInfo.shortAdvice}</p>

            {aiPlan && Array.isArray(aiPlan.priorityIndoorTips) && aiPlan.priorityIndoorTips.length > 0 ? (
              <ul className="space-y-3 pt-2 border-t border-slate-100">
                {aiPlan.priorityIndoorTips.map((tip, index) => (
                  <li key={index} className="text-sm text-slate-700 leading-relaxed flex gap-3">
                    <span className="font-mono text-xs text-[#0F766E] font-semibold mt-0.5 tabular-nums">
                      0{index + 1}.
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2.5 pt-2 border-t border-slate-100 text-sm text-slate-700">
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-[#0F766E] font-semibold mt-0.5">01.</span>
                  <span>
                    Wear a snug FFP2/N95 respirator for outdoor walks whenever AQI climbs above 150.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-[#0F766E] font-semibold mt-0.5">02.</span>
                  <span>
                    Run HEPA or DIY MERV-13 filtration continuously in bedrooms before evening inversion locks in.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs text-[#0F766E] font-semibold mt-0.5">03.</span>
                  <span>
                    Avoid cold-start idling and solid-fuel fires—local emissions linger for 10+ hours under calm winter air.
                  </span>
                </li>
              </ul>
            )}

            {aiPlan?.topSwapSpotlight && (
              <div className="pt-4 border-t border-slate-100 space-y-1.5">
                <div className="text-xs font-medium text-[#0F766E]">
                  Top AI Swap Recommendation · Replaces {aiPlan.topSwapSpotlight.replaces}
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {aiPlan.topSwapSpotlight.title}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {aiPlan.topSwapSpotlight.directImpactExplanation}
                </p>
                <div className="font-mono text-xs text-slate-700 tabular-nums pt-1">
                  Est. {aiPlan.topSwapSpotlight.weeklyCo2Kg} kg CO₂e/wk saved ·{' '}
                  {aiPlan.topSwapSpotlight.dailyPm25GramsAvoided} g/day local PM2.5 avoided
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right: Chronological Low-Emission Routine Blocks */}
        <section className="xl:col-span-7 bg-white border border-slate-200/90 rounded-xl p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Today’s Low-Emission Family Schedule
              </h2>
              <p className="text-sm text-slate-600">
                Check off steps as your household completes them to track daily exposure protection.
              </p>
            </div>
            <div className="font-mono text-xs text-slate-600 tabular-nums" data-testid="routine-progress">
              {completedCount} / {routineBlocks.length} completed
            </div>
          </div>

          {isTailoring ? (
            <div className="divide-y divide-slate-100 py-2" aria-busy="true" aria-label="Generating tailored daily routine">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="py-5 space-y-3 animate-pulse">
                  <div className="h-3.5 w-40 bg-slate-200 rounded" />
                  <div className="h-5 w-3/4 bg-slate-200 rounded" />
                  <div className="h-4 w-full bg-slate-100 rounded" />
                  <div className="h-4 w-5/6 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {routineBlocks.map((block) => {
                const isDone = completedSet.has(block.id);
                return (
                  <article key={block.id} className="py-5 first:pt-5 last:pb-1">
                    <div className="flex items-start gap-4">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isDone}
                        aria-label={`Mark "${block.title}" as completed`}
                        onClick={() => onToggleRoutineComplete(block.id)}
                        className={`mt-1 w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                          isDone
                            ? 'bg-[#0F766E] border-[#0F766E] text-white'
                            : 'bg-white border-slate-300 text-transparent hover:border-[#0F766E]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </button>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span className="font-mono font-medium text-slate-700 tabular-nums">
                            {block.timeWindow}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{block.phase}</span>
                          {block.isAiTailored && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#0F766E] font-medium">Tailored by AI</span>
                            </>
                          )}
                        </div>

                        <h3
                          className={`text-base font-semibold tracking-tight ${
                            isDone ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {block.title}
                        </h3>

                        <p className="text-sm text-slate-700 leading-relaxed">{block.action}</p>

                        <div className="pt-2 space-y-1.5">
                          <p className="text-xs text-slate-600 leading-relaxed">
                            <span className="font-semibold text-slate-800">Why this matters: </span>
                            {block.directImpact}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-[#0F766E] tabular-nums">
                            <span>{block.emissionSavedLabel}</span>
                            <span aria-hidden="true" className="text-slate-300">
                              /
                            </span>
                            <span>{block.exposureDeltaLabel}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
