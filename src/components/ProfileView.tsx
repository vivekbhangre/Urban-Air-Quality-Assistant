import { useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import type {
  BuildingType,
  CityPreset,
  CommuteMode,
  CookingType,
  HeatingType,
  HouseholdProfile,
  SensitivityGroup,
} from '../types/air';
import { CITY_PRESETS } from '../data/airData';
import {
  aqiToEstimatedPm25,
  validateProfileInput,
  type ProfileValidationErrors,
} from '../utils/airImpact';

interface ProfileViewProps {
  profile: HouseholdProfile;
  onSaveProfile: (next: HouseholdProfile, tailorAfterSave: boolean) => void;
}

const SENSITIVITY_OPTIONS: Array<{ id: SensitivityGroup; label: string; detail: string }> = [
  { id: 'children', label: 'Young children', detail: 'Developing lungs & school commute exposure' },
  { id: 'older_adults', label: 'Older adults (65+)', detail: 'Higher cardiovascular particulate sensitivity' },
  { id: 'asthma_respiratory', label: 'Asthma or COPD', detail: 'Triggered by PM2.5 and indoor gas NO₂' },
  { id: 'outdoor_workers', label: 'Outdoor commuters / workers', detail: 'Prolonged street-level inhalation' },
];

export function ProfileView({ profile, onSaveProfile }: ProfileViewProps) {
  const [city, setCity] = useState(profile.city);
  const [regionLabel, setRegionLabel] = useState(profile.regionLabel);
  const [currentAqi, setCurrentAqi] = useState(String(profile.currentAqi));
  const [householdSize, setHouseholdSize] = useState(String(profile.householdSize));
  const [communityHomes, setCommunityHomes] = useState(String(profile.communityHomes));
  const [heating, setHeating] = useState<HeatingType>(profile.heating);
  const [commute, setCommute] = useState<CommuteMode>(profile.commute);
  const [cooking, setCooking] = useState<CookingType>(profile.cooking);
  const [building, setBuilding] = useState<BuildingType>(profile.building);
  const [sensitivities, setSensitivities] = useState<SensitivityGroup[]>(profile.sensitivities);
  const [errors, setErrors] = useState<ProfileValidationErrors>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const applyPreset = (preset: CityPreset) => {
    setCity(preset.city);
    setRegionLabel(preset.regionLabel);
    setCurrentAqi(String(preset.typicalWinterAqi));
    setErrors({});
    setSavedNotice(null);
  };

  const toggleSensitivity = (id: SensitivityGroup) => {
    setSensitivities((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    setSavedNotice(null);
  };

  const buildAndValidate = (): HouseholdProfile | null => {
    const parsedAqi = currentAqi.trim() === '' ? Number.NaN : Number(currentAqi);
    const parsedSize = householdSize.trim() === '' ? Number.NaN : Number(householdSize);
    const parsedCommunity = communityHomes.trim() === '' ? Number.NaN : Number(communityHomes);

    const validation = validateProfileInput({
      city,
      currentAqi: parsedAqi,
      householdSize: parsedSize,
      communityHomes: parsedCommunity,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      setSavedNotice(null);
      return null;
    }

    setErrors({});
    const roundedAqi = Math.round(parsedAqi);
    const matchedPreset = CITY_PRESETS.find(
      (p) => p.city.toLowerCase() === city.trim().toLowerCase()
    );
    const outdoorPm25 =
      matchedPreset && Math.abs(matchedPreset.typicalWinterAqi - roundedAqi) <= 5
        ? matchedPreset.typicalPm25
        : aqiToEstimatedPm25(roundedAqi);

    return {
      city: city.trim(),
      regionLabel: regionLabel.trim() || 'Urban Winter Basin',
      currentAqi: roundedAqi,
      outdoorPm25,
      householdSize: Math.round(parsedSize),
      communityHomes: Math.round(parsedCommunity),
      heating,
      commute,
      cooking,
      building,
      sensitivities,
    };
  };

  const handleSubmit = (e: React.FormEvent, tailorAfterSave = false) => {
    e.preventDefault();
    const validProfile = buildAndValidate();
    if (!validProfile) return;
    onSaveProfile(validProfile, tailorAfterSave);
    setSavedNotice(`Saved household profile for ${validProfile.city}. Routine and impact models updated.`);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <section className="bg-white border border-slate-200/90 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Household & Local Air Profile
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Tailor daily ventilation windows, indoor PM2.5 infiltration estimates, community emission multipliers, and GenAI recommendations to your exact city and living setup.
          </p>
        </div>

        {/* City Presets */}
        <div className="space-y-2.5 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <MapPin className="w-3.5 h-3.5 text-[#0F766E]" aria-hidden="true" />
            <span>Load a Winter Inversion City Preset</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {CITY_PRESETS.map((preset) => {
              const isSelected = city.trim().toLowerCase() === preset.city.toLowerCase();
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#0F766E] bg-[#F0FDFA]'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">{preset.city}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                    <span>AQI {preset.typicalWinterAqi}</span>
                    <span aria-hidden="true">·</span>
                    <span>{preset.typicalPm25} µg/m³</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={(e) => handleSubmit(e, false)} noValidate className="space-y-6 pt-4 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="profile-city" className="block text-xs font-medium text-slate-700 mb-1.5">
                City or Neighborhood
              </label>
              <input
                id="profile-city"
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  if (errors.city) setErrors((prev) => ({ ...prev, city: undefined }));
                  setSavedNotice(null);
                }}
                placeholder="e.g. Salt Lake City, UT"
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 ${
                  errors.city ? 'border-[#DC2626]' : 'border-slate-300 focus:border-[#0F766E]'
                }`}
              />
              {errors.city && (
                <p role="alert" className="mt-1 text-xs text-[#B91C1C]">
                  {errors.city}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="profile-region" className="block text-xs font-medium text-slate-700 mb-1.5">
                Airshed / Valley Geography
              </label>
              <input
                id="profile-region"
                type="text"
                value={regionLabel}
                onChange={(e) => {
                  setRegionLabel(e.target.value);
                  setSavedNotice(null);
                }}
                placeholder="e.g. Mountain valley basin"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0F766E]"
              />
            </div>

            <div>
              <label htmlFor="profile-aqi" className="block text-xs font-medium text-slate-700 mb-1.5">
                Current Local Winter AQI (0–500)
              </label>
              <input
                id="profile-aqi"
                type="number"
                min={0}
                max={500}
                value={currentAqi}
                onChange={(e) => {
                  setCurrentAqi(e.target.value);
                  if (errors.currentAqi) setErrors((prev) => ({ ...prev, currentAqi: undefined }));
                  setSavedNotice(null);
                }}
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 ${
                  errors.currentAqi ? 'border-[#DC2626]' : 'border-slate-300 focus:border-[#0F766E]'
                }`}
              />
              {errors.currentAqi && (
                <p role="alert" className="mt-1 text-xs text-[#B91C1C]">
                  {errors.currentAqi}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="profile-size" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Household Size
                </label>
                <input
                  id="profile-size"
                  type="number"
                  min={1}
                  max={25}
                  value={householdSize}
                  onChange={(e) => {
                    setHouseholdSize(e.target.value);
                    if (errors.householdSize)
                      setErrors((prev) => ({ ...prev, householdSize: undefined }));
                    setSavedNotice(null);
                  }}
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 ${
                    errors.householdSize ? 'border-[#DC2626]' : 'border-slate-300 focus:border-[#0F766E]'
                  }`}
                />
                {errors.householdSize && (
                  <p role="alert" className="mt-1 text-xs text-[#B91C1C]">
                    {errors.householdSize}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="profile-community" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Community Homes
                </label>
                <input
                  id="profile-community"
                  type="number"
                  min={1}
                  max={10000}
                  value={communityHomes}
                  onChange={(e) => {
                    setCommunityHomes(e.target.value);
                    if (errors.communityHomes)
                      setErrors((prev) => ({ ...prev, communityHomes: undefined }));
                    setSavedNotice(null);
                  }}
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 ${
                    errors.communityHomes
                      ? 'border-[#DC2626]'
                      : 'border-slate-300 focus:border-[#0F766E]'
                  }`}
                />
                {errors.communityHomes && (
                  <p role="alert" className="mt-1 text-xs text-[#B91C1C]">
                    {errors.communityHomes}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Lifestyle & Home Systems */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-slate-100">
            <div>
              <label htmlFor="profile-heating" className="block text-xs font-medium text-slate-700 mb-1.5">
                Primary Winter Heating
              </label>
              <select
                id="profile-heating"
                value={heating}
                onChange={(e) => setHeating(e.target.value as HeatingType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0F766E]"
              >
                <option value="wood_coal">Wood Stove / Fireplace / Coal</option>
                <option value="gas_furnace">Natural Gas / Oil Furnace</option>
                <option value="district_heating">Municipal District Heating</option>
                <option value="heat_pump">Electric Heat Pump</option>
                <option value="electric_space">Electric Baseboard / Space Heaters</option>
              </select>
            </div>

            <div>
              <label htmlFor="profile-commute" className="block text-xs font-medium text-slate-700 mb-1.5">
                Primary Weekday Commute
              </label>
              <select
                id="profile-commute"
                value={commute}
                onChange={(e) => setCommute(e.target.value as CommuteMode)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0F766E]"
              >
                <option value="solo_car">Solo Petrol Car / School Drop-off</option>
                <option value="diesel_commute">Diesel Vehicle / Van</option>
                <option value="public_transit">Public Transit (Bus / Rail)</option>
                <option value="walk_cycle">Walking / Cycling</option>
                <option value="hybrid_remote">Hybrid / Mostly Remote</option>
              </select>
            </div>

            <div>
              <label htmlFor="profile-cooking" className="block text-xs font-medium text-slate-700 mb-1.5">
                Kitchen Cooking Appliance
              </label>
              <select
                id="profile-cooking"
                value={cooking}
                onChange={(e) => setCooking(e.target.value as CookingType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0F766E]"
              >
                <option value="gas_stove">Gas Range / Open Flame</option>
                <option value="induction">Induction Cooktop</option>
                <option value="electric_coil">Electric Coil / Ceramic</option>
                <option value="biomass_solid">Solid-Fuel / Biomass Stove</option>
              </select>
            </div>

            <div>
              <label htmlFor="profile-building" className="block text-xs font-medium text-slate-700 mb-1.5">
                Building Envelope & Draftiness
              </label>
              <select
                id="profile-building"
                value={building}
                onChange={(e) => setBuilding(e.target.value as BuildingType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#0F766E]"
              >
                <option value="older_drafty">Older Building (Drafty Windows)</option>
                <option value="apartment_midrise">Mid-Rise Apartment (Shared Hallways)</option>
                <option value="detached_home">Detached Single-Family Home</option>
                <option value="modern_insulated">Modern Tightly Insulated Home</option>
              </select>
            </div>
          </div>

          {/* Sensitive Household Members */}
          <fieldset className="pt-4 border-t border-slate-100 space-y-3">
            <legend className="text-xs font-medium text-slate-700">
              Household Air-Quality Sensitivities
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SENSITIVITY_OPTIONS.map((opt) => {
                const checked = sensitivities.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggleSensitivity(opt.id)}
                    className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      checked
                        ? 'border-[#0F766E] bg-[#F0FDFA]'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-[#0F766E] border-[#0F766E] text-white'
                          : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </span>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                      <div className="text-xs text-slate-500">{opt.detail}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {savedNotice && (
            <div
              role="status"
              className="p-3.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-sm text-[#166534]"
            >
              {savedNotice}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Save Profile
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              className="px-5 py-2.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Save & Tailor Routine with AI
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
