import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAdvisorReply,
  normalizeCustomHack,
  normalizeTailoredPlan,
} from './normalizeAi';

test('normalizeTailoredPlan safely handles partial or missing arrays without throwing TypeError', () => {
  const partial = normalizeTailoredPlan({
    inversionBrief: 'Calm winter basin inversion tonight.',
    // routineBlocks and priorityIndoorTips intentionally omitted
  });

  assert.equal(partial.inversionBrief, 'Calm winter basin inversion tonight.');
  assert.deepEqual(partial.routineBlocks, []);
  assert.deepEqual(partial.priorityIndoorTips, []);
  assert.ok(partial.topSwapSpotlight.title.length > 0);
});

test('normalizeTailoredPlan maps snake_case keys and validates routine blocks', () => {
  const snake = normalizeTailoredPlan({
    inversion_brief: 'Cold air pool over Salt Lake Valley.',
    routine_blocks: [
      {
        time_window: '07:00 – 09:00',
        phase: 'Morning',
        title: 'Skip cold-start driving',
        action: 'Take light rail to work.',
        direct_impact: 'Avoids cold-engine exhaust burst.',
        emission_saved_label: '-2.2 kg CO2e',
        exposure_delta_label: '-40% dose',
      },
    ],
    priority_indoor_tips: ['Run MERV-13 filter overnight'],
  });

  assert.equal(snake.routineBlocks.length, 1);
  assert.equal(snake.routineBlocks[0].timeWindow, '07:00 – 09:00');
  assert.equal(snake.priorityIndoorTips.length, 1);
});

test('normalizeTailoredPlan rejects completely empty payloads with clear error', () => {
  assert.throws(() => normalizeTailoredPlan({}), /incomplete plan/i);
  assert.throws(() => normalizeTailoredPlan(null), /unexpected response/i);
});

test('normalizeCustomHack normalizes percentage factors and missing steps', () => {
  const hack = normalizeCustomHack({
    title: 'Entryway Door Sweep Seal',
    category: 'room sealing',
    pm25_reduction_factor: 25,
    summary: 'Stops hallway smoke infiltration.',
  });

  assert.equal(hack.category, 'Room Sealing');
  assert.equal(hack.pm25ReductionFactor, 0.25);
  assert.ok(hack.steps.length >= 1);
});

test('normalizeAdvisorReply normalizes missing impactSummary safely', () => {
  const result = normalizeAdvisorReply({ reply: 'Air rooms between 13:00 and 15:00.' });
  assert.equal(result.reply, 'Air rooms between 13:00 and 15:00.');
  assert.deepEqual(result.impactSummary, []);
});
