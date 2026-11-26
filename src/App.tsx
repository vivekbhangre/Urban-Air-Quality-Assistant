import { useRef } from 'react';
import { BASELINE_SWAPS } from './data/airData';
import { useClearWinterState } from './hooks/useClearWinterState';
import {
  DesktopSidebar,
  MobileNavDrawer,
  TopContextHeader,
} from './components/AppNavigation';
import { DailyRoutineView } from './components/DailyRoutineView';
import { IndoorAirView } from './components/IndoorAirView';
import { SustainableSwapsView } from './components/SustainableSwapsView';
import { AirAdvisorView } from './components/AirAdvisorView';
import { ProfileView } from './components/ProfileView';

export default function App() {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const state = useClearWinterState();

  return (
    <div className="min-h-screen bg-[#F6F7F8] text-slate-900 flex flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <DesktopSidebar
        activeTab={state.activeTab}
        profile={state.profile}
        aqiInfo={state.aqiInfo}
        onNavigate={state.navigate}
      />

      <MobileNavDrawer
        open={state.mobileMenuOpen}
        activeTab={state.activeTab}
        profile={state.profile}
        aqiInfo={state.aqiInfo}
        onClose={() => state.setMobileMenuOpen(false)}
        onNavigate={state.navigate}
        restoreFocusToRef={menuButtonRef}
      />

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <TopContextHeader
          activeTab={state.activeTab}
          mobileMenuOpen={state.mobileMenuOpen}
          menuButtonRef={menuButtonRef}
          profile={state.profile}
          aqiInfo={state.aqiInfo}
          onOpenMobileMenu={() => state.setMobileMenuOpen(true)}
          onNavigate={state.navigate}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 focus:outline-none"
        >
          {state.activeTab === 'routine' && (
            <DailyRoutineView
              profile={state.profile}
              aqiInfo={state.aqiInfo}
              hourlyCurve={state.hourlyCurve}
              inversionPattern={state.matchedPreset.inversionPattern}
              routineBlocks={state.routineBlocks}
              completedRoutineIds={state.completedRoutineIds}
              onToggleRoutineComplete={state.toggleRoutineComplete}
              indoorEstimate={state.indoorEstimate}
              swapTotals={state.swapTotals}
              aiPlan={state.aiPlan}
              isTailoring={state.isTailoring}
              tailorError={state.tailorError}
              onTailorWithAi={() =>
                void state.tailorWithAi(state.profile, Boolean(state.aiPlan))
              }
              onNavigate={state.navigate}
            />
          )}

          {state.activeTab === 'indoor' && (
            <IndoorAirView
              profile={state.profile}
              hacks={state.allHacks}
              activeHackIds={state.activeHackIds}
              onToggleHack={state.toggleHack}
              isCookingActive={state.isCookingActive}
              onToggleCooking={state.toggleCooking}
              indoorEstimate={state.indoorEstimate}
              onGenerateCustomHack={state.generateCustomHack}
              isGeneratingHack={state.isGeneratingHack}
              customHackError={state.customHackError}
            />
          )}

          {state.activeTab === 'swaps' && (
            <SustainableSwapsView
              profile={state.profile}
              swaps={BASELINE_SWAPS}
              selectedSwapIds={state.selectedSwapIds}
              onToggleSwap={state.toggleSwap}
              onUpdateCommunityHomes={state.updateCommunityHomes}
              totals={state.swapTotals}
            />
          )}

          {state.activeTab === 'advisor' && (
            <AirAdvisorView
              profile={state.profile}
              messages={state.advisorMessages}
              isSending={state.isAdvisorSending}
              onSendMessage={state.sendMessage}
              onClearChat={state.clearAdvisorChat}
              onNavigate={state.navigate}
            />
          )}

          {state.activeTab === 'profile' && (
            <ProfileView profile={state.profile} onSaveProfile={state.saveProfile} />
          )}
        </main>
      </div>
    </div>
  );
}
