import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aqiToEstimatedPm25,
  classifyAqi,
  computeSwapImpact,
  estimateIndoorPm25,
  findBestVentilationWindow,
  generateProfileRoutine,
  isSwapTailoredToProfile,
  sortSwapsForProfile,
  validateCustomHackPrompt,
  validateProfileInput,
} from './airImpact';
import type { HourlyAirPoint, HouseholdProfile, IndoorHack, SustainableSwap } from '../types/air';

const sampleCurve: HourlyAirPoint[] = [
  { hour: 6, label: '06:00', pm25: 148, inversionActive: true },
  { hour: 8, label: '08:00', pm25: 175, inversionActive: true },
  { hour: 10, label: '10:00', pm25: 120, inversionActive: true },
  { hour: 12, label: '12:00', pm25: 76, inversionActive: false },
  { hour: 14, label: '14:00', pm25: 62, inversionActive: false },
  { hour: 16, label: '16:00', pm25: 94, inversionActive: false },
  { hour: 18, label: '18:00', pm25: 158, inversionActive: true },
  { hour: 20, label: '20:00', pm25: 192, inversionActive: true },
];

const sampleHacks: IndoorHack[] = [
  {
    id: 'cr-box',
    title: 'Corsi-Rosenthal Box',
    category: 'Filtration',
    costLabel: '$65 DIY',
    setupTime: '30 min',
    pm25ReductionFactor: 0.55,
    summary: 'High-CADR MERV-13 DIY cube.',
    mechanism: 'Captures fine PM2.5 via electrostatic filter media.',
    steps: ['Tape 4 filters into a cube', 'Mount box fan on top'],
  },
  {
    id: 'draft-seal',
    title: 'Window Draft Seal',
    category: 'Room Sealing',
    costLabel: '$12',
    setupTime: '20 min',
    pm25ReductionFactor: 0.25,
    summary: 'Weatherstrip gaps.',
    mechanism: 'Reduces outdoor air leakage.',
    steps: ['Apply foam tape around sashes'],
  },
];

const sampleSwaps: SustainableSwap[] = [
  {
    id: 'swap-wood',
    title: 'Skip Evening Wood Fires on Inversion Days',
    category: 'Heating',
    replaces: 'Residential wood stove',
    weeklyCo2Kg: 14,
    dailyPm25GramsAvoided: 45,
    exposureReductionPct: 28,
    effortLevel: 'Low',
    costNote: '$0 immediate',
    directImpactExplanation: 'Eliminates local fine smoke plumes.',
    communityMultiplierNote: '100 homes prevent 4.5 kg/day of neighborhood smoke.',
  },
  {
    id: 'swap-transit',
    title: 'Shift Cold-Start Commutes to Electric Transit',
    category: 'Mobility',
    replaces: 'Solo winter car trips',
    weeklyCo2Kg: 18.5,
    dailyPm25GramsAvoided: 6,
    exposureReductionPct: 12,
    effortLevel: 'Moderate',
    costNote: 'Saves fuel',
    directImpactExplanation: 'Avoids cold-engine exhaust spikes.',
    communityMultiplierNote: 'Cuts morning corridor NO2.',
  },
];

test('classifyAqi maps thresholds accurately across winter smog bands', () => {
  assert.equal(classifyAqi(35).label, 'Good');
  assert.equal(classifyAqi(88).label, 'Moderate');
  assert.equal(classifyAqi(135).label, 'Unhealthy for Sensitive');
  assert.equal(classifyAqi(182).label, 'Unhealthy');
  assert.equal(classifyAqi(245).label, 'Very Unhealthy');
  assert.equal(classifyAqi(340).label, 'Hazardous');
});

test('findBestVentilationWindow locates lowest daytime PM2.5 window', () => {
  const window = findBestVentilationWindow(sampleCurve);
  assert.equal(window.startHour, 12);
  assert.equal(window.endHour, 14);
  assert.equal(window.label, '12:00 – 14:00');
  assert.equal(window.avgPm25, 69);
});

test('estimateIndoorPm25 lowers indoor particulate levels as hacks are stacked', () => {
  const none = estimateIndoorPm25(160, 'older_drafty', 'gas_stove', [], sampleHacks, true);
  const one = estimateIndoorPm25(160, 'older_drafty', 'gas_stove', ['cr-box'], sampleHacks, true);
  const two = estimateIndoorPm25(
    160,
    'older_drafty',
    'gas_stove',
    ['cr-box', 'draft-seal'],
    sampleHacks,
    true
  );

  assert.equal(none.reductionPercent, 0);
  assert.ok(one.mitigatedIndoorPm25 < none.mitigatedIndoorPm25);
  assert.ok(two.mitigatedIndoorPm25 < one.mitigatedIndoorPm25);
  assert.equal(two.activeCount, 2);
  assert.ok(two.reductionPercent > one.reductionPercent);
});

test('computeSwapImpact aggregates household and scales community impact properly', () => {
  const empty = computeSwapImpact(sampleSwaps, [], 3, 100);
  assert.equal(empty.selectedCount, 0);
  assert.equal(empty.householdWeeklyCo2Kg, 0);
  assert.equal(empty.communitySeasonPm25Kg, 0);

  const singleHome = computeSwapImpact(sampleSwaps, ['swap-wood', 'swap-transit'], 2, 1);
  const neighborhood = computeSwapImpact(sampleSwaps, ['swap-wood', 'swap-transit'], 2, 100);

  assert.equal(singleHome.selectedCount, 2);
  assert.equal(singleHome.householdWeeklyCo2Kg, 32.5);
  assert.ok(neighborhood.communitySeasonCo2Tons > singleHome.communitySeasonCo2Tons * 90);
  assert.ok(neighborhood.communitySeasonPm25Kg > 400);
  assert.ok(singleHome.householdExposureReductionPct > 28 && singleHome.householdExposureReductionPct < 40);
});

test('generateProfileRoutine adapts advice to wood heating and children', () => {
  const profile: HouseholdProfile = {
    city: 'Salt Lake City, UT',
    regionLabel: 'Wasatch Valley Basin',
    currentAqi: 195,
    outdoorPm25: 140,
    householdSize: 4,
    communityHomes: 50,
    heating: 'wood_coal',
    commute: 'solo_car',
    cooking: 'gas_stove',
    building: 'older_drafty',
    sensitivities: ['children', 'asthma_respiratory'],
  };

  const blocks = generateProfileRoutine(profile, sampleCurve);
  assert.equal(blocks.length, 4);
  assert.match(blocks[0].action, /Salt Lake City, UT/);
  assert.match(blocks[1].timeWindow, /12:00 – 14:00/);
  assert.match(blocks[3].action, /solid-fuel burning/i);
  assert.match(blocks[3].emissionSavedLabel, /PM2\.5/);
});

test('validateProfileInput rejects invalid inputs and accepts valid profiles', () => {
  const invalid = validateProfileInput({
    city: ' ',
    currentAqi: 750,
    householdSize: 0,
    communityHomes: -5,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.city);
  assert.ok(invalid.errors.currentAqi);
  assert.ok(invalid.errors.householdSize);
  assert.ok(invalid.errors.communityHomes);

  const valid = validateProfileInput({
    city: 'Kraków, Poland',
    currentAqi: 218,
    householdSize: 3,
    communityHomes: 100,
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('validateCustomHackPrompt enforces minimum length', () => {
  assert.ok(validateCustomHackPrompt('short') !== null);
  assert.equal(validateCustomHackPrompt('Old apartment with gas stove and cold hallway drafts'), null);
});

test('aqiToEstimatedPm25 produces monotonic realistic PM2.5 concentrations', () => {
  assert.ok(aqiToEstimatedPm25(50) <= 15);
  assert.ok(aqiToEstimatedPm25(150) > aqiToEstimatedPm25(100));
  assert.ok(aqiToEstimatedPm25(250) > 150);
});

test('isSwapTailoredToProfile and sortSwapsForProfile prioritize relevant household swaps', () => {
  const transitOnlyProfile = {
    heating: 'district_heating' as const,
    commute: 'solo_car' as const,
    cooking: 'induction' as const,
    sensitivities: [] as HouseholdProfile['sensitivities'],
  };

  assert.equal(
    isSwapTailoredToProfile({ id: 'swap-no-wood-burn' }, transitOnlyProfile),
    false
  );
  assert.equal(
    isSwapTailoredToProfile({ id: 'swap-cold-start-transit' }, transitOnlyProfile),
    true
  );

  const tailoredSwaps: SustainableSwap[] = [
    { ...sampleSwaps[0], id: 'swap-no-wood-burn' },
    { ...sampleSwaps[1], id: 'swap-cold-start-transit' },
  ];

  const sorted = sortSwapsForProfile(tailoredSwaps, transitOnlyProfile);
  assert.equal(sorted[0].id, 'swap-cold-start-transit');
});
