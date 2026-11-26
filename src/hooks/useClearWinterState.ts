import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BASELINE_INDOOR_HACKS,
  BASELINE_SWAPS,
  CITY_PRESETS,
} from '../data/airData';
import {
  fetchTailoredPlan,
  generateCustomIndoorHack,
  sendAdvisorMessage,
} from '../services/api';
import type {
  AdvisorMessage,
  HouseholdProfile,
  IndoorHack,
  NavigationTab,
  RoutineBlock,
  TailoredPlanResponse,
} from '../types/air';
import {
  classifyAqi,
  computeSwapImpact,
  estimateIndoorPm25,
  generateProfileRoutine,
  scaleCurveToPm25,
} from '../utils/airImpact';
import { loadPersistedState, savePersistedState } from '../utils/storage';

const VALID_HACK_CATEGORIES: ReadonlySet<IndoorHack['category']> = new Set([
  'Filtration',
  'Ventilation',
  'Source Control',
  'Room Sealing',
]);

/**
 * Central application state hook coordinating persisted household preferences,
 * deterministic air-impact models, and server-side GenAI tailoring workflows.
 */
export function useClearWinterState() {
  const initial = useMemo(() => loadPersistedState(), []);

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

  const [aiPlan, setAiPlan] = useState<TailoredPlanResponse | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorError, setTailorError] = useState<string | null>(null);

  const [isGeneratingHack, setIsGeneratingHack] = useState(false);
  const [customHackError, setCustomHackError] = useState<string | null>(null);

  const [advisorMessages, setAdvisorMessages] = useState<AdvisorMessage[]>([]);
  const [isAdvisorSending, setIsAdvisorSending] = useState(false);

  useEffect(() => {
    savePersistedState({
      profile,
      completedRoutineIds,
      activeHackIds,
      customHacks,
      selectedSwapIds,
    });
  }, [profile, completedRoutineIds, activeHackIds, customHacks, selectedSwapIds]);

  const matchedPreset = useMemo(
    () =>
      CITY_PRESETS.find((p) => p.city.toLowerCase() === profile.city.toLowerCase()) ??
      CITY_PRESETS[0],
    [profile.city]
  );

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

  const navigate = useCallback((tab: NavigationTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  }, []);

  const tailorWithAi = useCallback(
    async (targetProfile: HouseholdProfile = profile, forceRefresh = false) => {
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
    },
    [profile]
  );

  const saveProfile = useCallback(
    (nextProfile: HouseholdProfile, tailorAfterSave: boolean) => {
      setProfile(nextProfile);
      setAiPlan(null);
      setTailorError(null);
      if (tailorAfterSave) {
        setActiveTab('routine');
        void tailorWithAi(nextProfile, false);
      }
    },
    [tailorWithAi]
  );

  const toggleRoutineComplete = useCallback((id: string) => {
    setCompletedRoutineIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const toggleHack = useCallback((id: string) => {
    setActiveHackIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const toggleCooking = useCallback(() => {
    setIsCookingActive((prev) => !prev);
  }, []);

  const generateCustomHack = useCallback(
    async (challenge: string) => {
      setIsGeneratingHack(true);
      setCustomHackError(null);
      try {
        const generated = await generateCustomIndoorHack(profile, challenge);
        const safeCategory = VALID_HACK_CATEGORIES.has(generated.category)
          ? generated.category
          : 'Filtration';

        const newHack: IndoorHack = {
          ...generated,
          id: `custom-${Date.now()}`,
          category: safeCategory,
          pm25ReductionFactor: Math.min(
            0.45,
            Math.max(0.08, Number(generated.pm25ReductionFactor) || 0.2)
          ),
          isCustomAi: true,
        };
        setCustomHacks((prev) => [newHack, ...prev]);
        setActiveHackIds((prev) => [newHack.id, ...prev]);
      } catch (err) {
        setCustomHackError(
          err instanceof Error
            ? err.message
            : 'Unable to generate a custom indoor air hack right now.'
        );
      } finally {
        setIsGeneratingHack(false);
      }
    },
    [profile]
  );

  const toggleSwap = useCallback((id: string) => {
    setSelectedSwapIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const updateCommunityHomes = useCallback((homes: number) => {
    setProfile((prev) => ({
      ...prev,
      communityHomes: Math.max(1, Math.min(10000, Math.round(homes))),
    }));
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
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
    },
    [advisorMessages, profile]
  );

  const clearAdvisorChat = useCallback(() => {
    setAdvisorMessages([]);
  }, []);

  return {
    activeTab,
    mobileMenuOpen,
    setMobileMenuOpen,
    navigate,
    profile,
    aqiInfo,
    matchedPreset,
    hourlyCurve,
    routineBlocks,
    completedRoutineIds,
    toggleRoutineComplete,
    allHacks,
    activeHackIds,
    toggleHack,
    isCookingActive,
    toggleCooking,
    indoorEstimate,
    generateCustomHack,
    isGeneratingHack,
    customHackError,
    selectedSwapIds,
    toggleSwap,
    updateCommunityHomes,
    swapTotals,
    aiPlan,
    isTailoring,
    tailorError,
    tailorWithAi,
    saveProfile,
    advisorMessages,
    isAdvisorSending,
    sendMessage,
    clearAdvisorChat,
  };
}
