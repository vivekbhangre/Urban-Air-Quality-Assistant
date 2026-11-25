import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Home,
  Leaf,
  MessageSquare,
  SlidersHorizontal,
  Menu,
  X,
  Wind,
} from 'lucide-react';
import type {
  AdvisorMessage,
  HouseholdProfile,
  IndoorHack,
  NavigationTab,
  RoutineBlock,
  TailoredPlanResponse,
} from './types/air';
import {
  BASELINE_INDOOR_HACKS,
  BASELINE_SWAPS,
  CITY_PRESETS,
  DEFAULT_PROFILE,
} from './data/airData';
import {
  classifyAqi,
  computeSwapImpact,
  estimateIndoorPm25,
  generateProfileRoutine,
  scaleCurveToPm25,
} from './utils/airImpact';
import {
  fetchTailoredPlan,
  generateCustomIndoorHack,
  sendAdvisorMessage,
} from './services/api';
import { DailyRoutineView } from './components/DailyRoutineView';
import { IndoorAirView } from './components/IndoorAirView';
import { SustainableSwapsView } from './components/SustainableSwapsView';
import { AirAdvisorView } from './components/AirAdvisorView';
import { ProfileView } from './components/ProfileView';

const STORAGE_KEY = 'clearwinter_state_v1';

interface PersistedState {
  profile: HouseholdProfile;
  completedRoutineIds: string[];
  activeHackIds: string[];
  customHacks: IndoorHack[];
  selectedSwapIds: string[];
}

function loadInitialState(): PersistedState {
  const fallback: PersistedState = {
    profile: DEFAULT_PROFILE,
    completedRoutineIds: ['midday-vent'],
    activeHackIds: ['corsi-rosenthal', 'range-hood-rear-burner'],
    customHacks: [],
    selectedSwapIds: ['swap-no-wood-burn', 'swap-cold-start-transit', 'swap-thermostat-setback'],
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const hydratedProfile: HouseholdProfile = parsed.profile?.city
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
      completedRoutineIds: Array.isArray(parsed.completedRoutineIds)
        ? parsed.completedRoutineIds
        : fallback.completedRoutineIds,
      activeHackIds: Array.isArray(parsed.activeHackIds)
        ? parsed.activeHackIds
        : fallback.activeHackIds,
      customHacks: Array.isArray(parsed.customHacks)
        ? parsed.customHacks.filter((h) => h && typeof h.id === 'string' && Array.isArray(h.steps))
        : [],
      selectedSwapIds: Array.isArray(parsed.selectedSwapIds)
        ? parsed.selectedSwapIds
        : fallback.selectedSwapIds,
    };
  } catch {
    return fallback;
  }
}

const NAV_ITEMS: Array<{ id: NavigationTab; label: string; icon: typeof CalendarClock }> = [
  { id: 'routine', label: 'Daily Routine', icon: CalendarClock },
  { id: 'indoor', label: 'Indoor Air Hacks', icon: Home },
  { id: 'swaps', label: 'Sustainable Swaps', icon: Leaf },
  { id: 'advisor', label: 'Air Advisor', icon: MessageSquare },
  { id: 'profile', label: 'Household Profile', icon: SlidersHorizontal },
];

const TAB_LABELS: Record<NavigationTab, string> = {
  routine: 'Daily Routine',
  indoor: 'Indoor Air Hacks',
  swaps: 'Sustainable Swaps',
  advisor: 'Air Advisor',
  profile: 'Household Profile',
};

export default function App() {
  const initial = useMemo(() => loadInitialState(), []);

  const [activeTab, setActiveTab] = useState<NavigationTab>('routine');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [profile, setProfile] = useState<HouseholdProfile>(initial.profile);
  const [completedRoutineIds, setCompletedRoutineIds] = useState<string[]>(
    initial.completedRoutineIds
  );
  const [activeHackIds, setActiveHackIds] = useState<string[]>(initial.activeHackIds);
  const [customHacks, setCustomHacks] = useState<IndoorHack[]>(initial.customHacks);
  const [isCookingActive, setIsCookingActive] = useState(false);
  const [selectedSwapIds, setSelectedSwapIds] = useState<string[]>(initial.selectedSwapIds);

  // GenAI state
  const [aiPlan, setAiPlan] = useState<TailoredPlanResponse | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorError, setTailorError] = useState<string | null>(null);

  const [isGeneratingHack, setIsGeneratingHack] = useState(false);
  const [customHackError, setCustomHackError] = useState<string | null>(null);

  const [advisorMessages, setAdvisorMessages] = useState<AdvisorMessage[]>([]);
  const [isAdvisorSending, setIsAdvisorSending] = useState(false);

  useEffect(() => {
    try {
      const payload: PersistedState = {
        profile,
        completedRoutineIds,
        activeHackIds,
        customHacks,
        selectedSwapIds,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors in restricted sandboxes
    }
  }, [profile, completedRoutineIds, activeHackIds, customHacks, selectedSwapIds]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const matchedPreset = useMemo(() => {
    return (
      CITY_PRESETS.find((p) => p.city.toLowerCase() === profile.city.toLowerCase()) ??
      CITY_PRESETS[0]
    );
  }, [profile.city]);

  const hourlyCurve = useMemo(
    () => scaleCurveToPm25(matchedPreset, profile.outdoorPm25),
    [matchedPreset, profile.outdoorPm25]
  );

  const aqiInfo = useMemo(() => classifyAqi(profile.currentAqi), [profile.currentAqi]);

  const allHacks = useMemo(
    () => [...customHacks, ...BASELINE_INDOOR_HACKS],
    [customHacks]
  );

  const indoorEstimate = useMemo(
    () =>
      estimateIndoorPm25(
        profile.outdoorPm25,
        profile.building,
        profile.cooking,
        activeHackIds,
        allHacks,
        isCookingActive
      ),
    [profile.outdoorPm25, profile.building, profile.cooking, activeHackIds, allHacks, isCookingActive]
  );

  const swapTotals = useMemo(
    () =>
      computeSwapImpact(
        BASELINE_SWAPS,
        selectedSwapIds,
        profile.householdSize,
        profile.communityHomes
      ),
    [selectedSwapIds, profile.householdSize, profile.communityHomes]
  );

  const routineBlocks: RoutineBlock[] = useMemo(() => {
    if (aiPlan && Array.isArray(aiPlan.routineBlocks) && aiPlan.routineBlocks.length > 0) {
      return aiPlan.routineBlocks.map((b) => ({ ...b, isAiTailored: true }));
    }
    return generateProfileRoutine(profile, hourlyCurve);
  }, [aiPlan, profile, hourlyCurve]);

  const handleNavigate = (tab: NavigationTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleTailorWithAi = async (
    targetProfile: HouseholdProfile = profile,
    forceRefresh = false
  ) => {
    setIsTailoring(true);
    setTailorError(null);
    try {
      const tailored = await fetchTailoredPlan(targetProfile, forceRefresh);
      setAiPlan(tailored);
    } catch (err) {
      setTailorError(
        err instanceof Error ? err.message : 'Unable to generate an AI-tailored plan right now.'
      );
    } finally {
      setIsTailoring(false);
    }
  };

  const handleSaveProfile = (nextProfile: HouseholdProfile, tailorAfterSave: boolean) => {
    setProfile(nextProfile);
    setAiPlan(null);
    setTailorError(null);
    if (tailorAfterSave) {
      setActiveTab('routine');
      void handleTailorWithAi(nextProfile);
    }
  };

  const handleToggleRoutineComplete = (id: string) => {
    setCompletedRoutineIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleHack = (id: string) => {
    setActiveHackIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGenerateCustomHack = async (challenge: string) => {
    setIsGeneratingHack(true);
    setCustomHackError(null);
    try {
      const generated = await generateCustomIndoorHack(profile, challenge);
      const validCategories: IndoorHack['category'][] = [
        'Filtration',
        'Ventilation',
        'Source Control',
        'Room Sealing',
      ];
      const safeCategory = validCategories.includes(generated.category)
        ? generated.category
        : 'Filtration';

      const newHack: IndoorHack = {
        ...generated,
        id: `custom-${Date.now()}`,
        category: safeCategory,
        pm25ReductionFactor: Math.min(0.45, Math.max(0.08, Number(generated.pm25ReductionFactor) || 0.2)),
        isCustomAi: true,
      };
      setCustomHacks((prev) => [newHack, ...prev]);
      setActiveHackIds((prev) => [newHack.id, ...prev]);
    } catch (err) {
      setCustomHackError(
        err instanceof Error ? err.message : 'Unable to generate a custom indoor air hack right now.'
      );
    } finally {
      setIsGeneratingHack(false);
    }
  };

  const handleToggleSwap = (id: string) => {
    setSelectedSwapIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleUpdateCommunityHomes = (homes: number) => {
    setProfile((prev) => ({
      ...prev,
      communityHomes: Math.max(1, Math.min(10000, Math.round(homes))),
    }));
  };

  const handleSendAdvisorMessage = async (content: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: AdvisorMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp,
    };

    const nextHistory = [...advisorMessages.filter((m) => !m.isError), userMsg];
    setAdvisorMessages((prev) => [...prev, userMsg]);
    setIsAdvisorSending(true);

    try {
      const response = await sendAdvisorMessage(
        profile,
        nextHistory.map((m) => ({ role: m.role, content: m.content }))
      );
      const replyMsg: AdvisorMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        impactSummary: response.impactSummary,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setAdvisorMessages((prev) => [...prev, replyMsg]);
    } catch (err) {
      const errorMsg: AdvisorMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content:
          err instanceof Error
            ? err.message
            : 'Unable to reach the ClearWinter Advisor right now.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setAdvisorMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsAdvisorSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F8] text-slate-900 flex flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200/90">
        <div className="px-6 h-16 flex items-center border-b border-slate-100">
          <button
            type="button"
            onClick={() => handleNavigate('routine')}
            className="flex items-center gap-2.5 text-left cursor-pointer"
          >
            <Wind className="w-5 h-5 text-[#0F766E] shrink-0" aria-hidden="true" />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              ClearWinter
            </span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Household Snapshot in Sidebar Footer */}
        <div className="p-5 border-t border-slate-100 space-y-2.5">
          <div className="text-xs font-medium text-slate-500">Active Airshed</div>
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-slate-900 truncate">{profile.city}</div>
            <div className={`text-xs font-mono tabular-nums font-medium ${aqiInfo.textColorClass}`}>
              AQI {profile.currentAqi} · {aqiInfo.label}
            </div>
            <div className="text-xs text-slate-500">
              {profile.householdSize} residents · {profile.communityHomes} neighborhood homes
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleNavigate('profile')}
            className="text-xs font-medium text-[#0F766E] hover:underline underline-offset-2 cursor-pointer"
          >
            Change location or home setup
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="relative w-72 max-w-[82vw] bg-white h-full flex flex-col border-r border-slate-200 z-10"
          >
            <div className="px-5 h-14 flex items-center justify-between border-b border-slate-100">
              <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                ClearWinter
              </span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Mobile navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-5 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-900">{profile.city}</div>
              <div className={`font-mono tabular-nums ${aqiInfo.textColorClass}`}>
                AQI {profile.currentAqi} · {aqiInfo.label}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Context Header (Single-row 3-zone SaaS contract, compact on mobile) */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200/90 h-14 lg:h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-display font-semibold text-slate-900 lg:text-slate-500 lg:font-normal whitespace-nowrap">
                ClearWinter
              </span>
              <span aria-hidden="true" className="text-slate-300">
                /
              </span>
              <span className="font-medium text-slate-900 truncate">
                {TAB_LABELS[activeTab]}
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 whitespace-nowrap shrink-0">
            <span className="font-medium text-slate-800">{profile.city}</span>
            <span aria-hidden="true">·</span>
            <span className={`font-mono tabular-nums font-semibold ${aqiInfo.textColorClass}`}>
              AQI {profile.currentAqi} ({aqiInfo.label})
            </span>
          </div>

          <div className="shrink-0">
            {activeTab === 'profile' ? (
              <button
                type="button"
                onClick={() => handleNavigate('routine')}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                View Routine
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate('profile')}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Edit Profile
              </button>
            )}
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 focus:outline-none"
        >
          {activeTab === 'routine' && (
            <DailyRoutineView
              profile={profile}
              aqiInfo={aqiInfo}
              hourlyCurve={hourlyCurve}
              inversionPattern={matchedPreset.inversionPattern}
              routineBlocks={routineBlocks}
              completedRoutineIds={completedRoutineIds}
              onToggleRoutineComplete={handleToggleRoutineComplete}
              indoorEstimate={indoorEstimate}
              swapTotals={swapTotals}
              aiPlan={aiPlan}
              isTailoring={isTailoring}
              tailorError={tailorError}
              onTailorWithAi={() => void handleTailorWithAi(profile, Boolean(aiPlan))}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'indoor' && (
            <IndoorAirView
              profile={profile}
              hacks={allHacks}
              activeHackIds={activeHackIds}
              onToggleHack={handleToggleHack}
              isCookingActive={isCookingActive}
              onToggleCooking={() => setIsCookingActive((prev) => !prev)}
              indoorEstimate={indoorEstimate}
              onGenerateCustomHack={handleGenerateCustomHack}
              isGeneratingHack={isGeneratingHack}
              customHackError={customHackError}
            />
          )}

          {activeTab === 'swaps' && (
            <SustainableSwapsView
              profile={profile}
              swaps={BASELINE_SWAPS}
              selectedSwapIds={selectedSwapIds}
              onToggleSwap={handleToggleSwap}
              onUpdateCommunityHomes={handleUpdateCommunityHomes}
              totals={swapTotals}
            />
          )}

          {activeTab === 'advisor' && (
            <AirAdvisorView
              profile={profile}
              messages={advisorMessages}
              isSending={isAdvisorSending}
              onSendMessage={handleSendAdvisorMessage}
              onClearChat={() => setAdvisorMessages([])}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView profile={profile} onSaveProfile={handleSaveProfile} />
          )}
        </main>
      </div>
    </div>
  );
}
