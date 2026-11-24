// Meridian Deep day/night discovery prompt state machine tests. Run: npx tsx scripts/sky-hint-test.ts
import assert from 'node:assert/strict';
import { THRESHOLD } from '../src/layoutMetro';
import { SKY_HINT_DURATION_MS, SKY_HINT_TRIGGER_Y, SkyHintController } from '../src/ui/skyHint';

let passed = 0;
const test = (name: string, fn: () => void): void => {
  fn();
  passed++;
  console.log(`ok   ${name}`);
};

test('constants align with Threshold height and 7-second duration', () => {
  assert.equal(SKY_HINT_DURATION_MS, 7000);
  assert.equal(SKY_HINT_TRIGGER_Y, THRESHOLD.y + 1.0);
});

test('does not fire above Threshold or while inactive, fires once on arrival', () => {
  const c = new SkyHintController(false);
  assert.equal(c.state, 'armed');
  // Surface and upper void flights
  assert.equal(c.update(0, true), null);
  assert.equal(c.update(-10, true), null);
  assert.equal(c.update(-20, true), null);
  assert.equal(c.update(SKY_HINT_TRIGGER_Y + 0.05, true), null);
  // At Threshold height while paused/unlocked: must wait until active
  assert.equal(c.update(THRESHOLD.y, false), null);
  assert.equal(c.state, 'armed');
  // Active at Threshold: fires once
  assert.equal(c.update(SKY_HINT_TRIGGER_Y, true), 'show');
  assert.equal(c.state, 'showing');
  assert.equal(c.update(THRESHOLD.y, true), null);
});

test('pauses when unlocked or hidden and resumes cleanly', () => {
  const c = new SkyHintController(false);
  assert.equal(c.update(THRESHOLD.y, true), 'show');
  assert.equal(c.paused, false);
  assert.equal(c.update(THRESHOLD.y, false), 'pause');
  assert.equal(c.paused, true);
  assert.equal(c.update(THRESHOLD.y, false), null);
  assert.equal(c.update(THRESHOLD.y, true), 'resume');
  assert.equal(c.paused, false);
  assert.equal(c.update(THRESHOLD.y, true), null);
});

test('pressing N dismisses immediately when showing and never re-triggers', () => {
  const c = new SkyHintController(false);
  // Pressing N upstairs before reaching Threshold must not disarm the hint
  assert.equal(c.onKeyN(), false);
  assert.equal(c.state, 'armed');
  assert.equal(c.update(THRESHOLD.y, true), 'show');
  assert.equal(c.onKeyN(), true);
  assert.equal(c.state, 'dismissed');
  assert.equal(c.onKeyN(), false);
  assert.equal(c.onTimeout(), false);
  // Climbing back up and descending again never re-triggers
  assert.equal(c.update(0, true), null);
  assert.equal(c.update(THRESHOLD.y, true), null);
});

test('auto-dismisses cleanly on 7s timeout and never re-triggers', () => {
  const c = new SkyHintController(false);
  assert.equal(c.update(THRESHOLD.y, true), 'show');
  assert.equal(c.onTimeout(), true);
  assert.equal(c.state, 'dismissed');
  assert.equal(c.onKeyN(), false);
  assert.equal(c.update(THRESHOLD.y, true), null);
});

test('disabled mode (preset cameras) starts dismissed and never shows', () => {
  const c = new SkyHintController(true);
  assert.equal(c.state, 'dismissed');
  assert.equal(c.update(THRESHOLD.y, true), null);
  assert.equal(c.update(-70, true), null);
});

console.log(`\n${passed} sky-hint checks passed`);
