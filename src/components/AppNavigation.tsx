import { useEffect, useRef } from 'react';
import {
  CalendarClock,
  Home,
  Leaf,
  Menu,
  MessageSquare,
  SlidersHorizontal,
  Wind,
  X,
} from 'lucide-react';
import type { AqiClassification, HouseholdProfile, NavigationTab } from '../types/air';

export const NAV_ITEMS: ReadonlyArray<{
  id: NavigationTab;
  label: string;
  icon: typeof CalendarClock;
}> = [
  { id: 'routine', label: 'Daily Routine', icon: CalendarClock },
  { id: 'indoor', label: 'Indoor Air Hacks', icon: Home },
  { id: 'swaps', label: 'Sustainable Swaps', icon: Leaf },
  { id: 'advisor', label: 'Air Advisor', icon: MessageSquare },
  { id: 'profile', label: 'Household Profile', icon: SlidersHorizontal },
];

export const TAB_LABELS: Record<NavigationTab, string> = {
  routine: 'Daily Routine',
  indoor: 'Indoor Air Hacks',
  swaps: 'Sustainable Swaps',
  advisor: 'Air Advisor',
  profile: 'Household Profile',
};

interface DesktopSidebarProps {
  activeTab: NavigationTab;
  profile: HouseholdProfile;
  aqiInfo: AqiClassification;
  onNavigate: (tab: NavigationTab) => void;
}

export function DesktopSidebar({
  activeTab,
  profile,
  aqiInfo,
  onNavigate,
}: DesktopSidebarProps) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200/90">
      <div className="px-6 h-16 flex items-center border-b border-slate-100">
        <button
          type="button"
          onClick={() => onNavigate('routine')}
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
              onClick={() => onNavigate(item.id)}
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
          onClick={() => onNavigate('profile')}
          className="text-xs font-medium text-[#0F766E] hover:underline underline-offset-2 cursor-pointer"
        >
          Change location or home setup
        </button>
      </div>
    </aside>
  );
}

interface MobileNavDrawerProps {
  open: boolean;
  activeTab: NavigationTab;
  profile: HouseholdProfile;
  aqiInfo: AqiClassification;
  onClose: () => void;
  onNavigate: (tab: NavigationTab) => void;
  restoreFocusToRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MobileNavDrawer({
  open,
  activeTab,
  profile,
  aqiInfo,
  onClose,
  onNavigate,
  restoreFocusToRef,
}: MobileNavDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      closeButtonRef.current?.focus();

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      restoreFocusToRef?.current?.focus();
    }
    return undefined;
  }, [open, onClose, restoreFocusToRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      <div
        className="fixed inset-0 bg-slate-900/40"
        onClick={onClose}
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
            ref={closeButtonRef}
            type="button"
            aria-label="Close navigation menu"
            onClick={onClose}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
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
                onClick={() => onNavigate(item.id)}
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
  );
}

interface TopContextHeaderProps {
  activeTab: NavigationTab;
  mobileMenuOpen: boolean;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  profile: HouseholdProfile;
  aqiInfo: AqiClassification;
  onOpenMobileMenu: () => void;
  onNavigate: (tab: NavigationTab) => void;
}

export function TopContextHeader({
  activeTab,
  mobileMenuOpen,
  menuButtonRef,
  profile,
  aqiInfo,
  onOpenMobileMenu,
  onNavigate,
}: TopContextHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200/90 h-14 lg:h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
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
            onClick={() => onNavigate('routine')}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            View Routine
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Edit Profile
          </button>
        )}
      </div>
    </header>
  );
}
