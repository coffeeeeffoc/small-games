import { describe, expect, it } from 'vitest';

import {
  actOfficeSample,
  createOfficeSample,
  updateOfficeSample,
  type OfficeSampleState,
} from '../src/sample/model.js';

function advance(state: OfficeSampleState, seconds: number, fps = 60) {
  const end = state.elapsed + seconds;
  let next = state;
  while (next.elapsed < end - 1e-7 && next.status === 'playing') {
    next = updateOfficeSample(next, Math.min(1 / fps, end - next.elapsed));
  }
  return next;
}

function start(variant = 0) {
  return actOfficeSample(actOfficeSample(createOfficeSample(variant), { type: 'start' }), {
    type: 'confirm-data',
    value: 42,
  });
}

function complete(fps: number, variant = 0) {
  let state = actOfficeSample(start(variant), { type: 'pc-entertainment' });
  state = advance(state, 20, fps);
  state = actOfficeSample(state, { type: 'pc-work' });
  while (state.elapsed < 90 - 1e-7 && state.status === 'playing') {
    state = updateOfficeSample(state, 1 / fps);
    if (state.file === 'offered') state = actOfficeSample(state, { type: 'take-file' });
    if (state.phoneNotice === 'vibrating')
      state = actOfficeSample(state, { type: 'silence-phone' });
    if (state.questionUntil !== null) state = actOfficeSample(state, { type: 'answer', value: 42 });
  }
  return state;
}

describe('desk sample rules', () => {
  it('freezes intro, rejects invalid time and restarts all transient state without a payment', () => {
    const intro = createOfficeSample();
    expect(updateOfficeSample(intro, 1)).toBe(intro);
    for (const dt of [-1, 1.1, NaN, Infinity])
      expect(() => updateOfficeSample(intro, dt)).toThrow(RangeError);
    expect(() => createOfficeSample(3)).toThrow(RangeError);
    expect(actOfficeSample(advance(start(), 4), { type: 'restart' })).toEqual(
      createOfficeSample(1),
    );
  });

  it('has the same safe completion and score at 30 and 60 fps for every route', () => {
    for (const variant of [0, 1, 2]) {
      const low = complete(30, variant);
      const high = complete(60, variant);
      expect(low.status).toBe('won');
      expect(high.status).toBe('won');
      expect(low.elapsed).toBe(90);
      expect(low.joy).toBeCloseTo(20, 7);
      expect(high.joy).toBeCloseTo(low.joy, 7);
    }
  });

  it('keeps computer and phone evidence independent and rewards only current attention', () => {
    let state = actOfficeSample(start(), { type: 'pc-entertainment' });
    state = actOfficeSample(state, { type: 'phone-start' });
    state = advance(state, 2);
    expect(state.joy).toBeCloseTo(1.5, 7);
    state = actOfficeSample(state, { type: 'pc-work' });
    expect(state.phone).toBe('using');
    state = actOfficeSample(state, { type: 'pc-entertainment' });
    state = advance(actOfficeSample(state, { type: 'phone-stop' }), 0.8);
    expect(state.phone).toBe('working');
    expect(state.pc).toBe('entertainment');
    expect(state.joy).toBeCloseTo(2.3, 7);
  });

  it('interrupts pickup continuously and repeated input cannot reset or reverse stowing', () => {
    let state = advance(actOfficeSample(start(), { type: 'phone-start' }), 0.2);
    expect(state.phoneProgress).toBeCloseTo(0.4);
    state = actOfficeSample(state, { type: 'phone-stop' });
    expect(state.phoneProgress).toBeCloseTo(0.4);
    state = advance(state, 0.16);
    expect(state.phoneProgress).toBeCloseTo(0.2);
    for (let index = 0; index < 10; index += 1) {
      state = actOfficeSample(state, { type: 'phone-stop' });
      state = actOfficeSample(state, { type: 'phone-start' });
    }
    state = advance(state, 0.16);
    expect(state.phone).toBe('working');
    expect(state.joy).toBe(0);
  });

  it('pauses pending motions and questions without clearing evidence or earning offline joy', () => {
    let state = actOfficeSample(start(), { type: 'pc-entertainment' });
    state = advance(actOfficeSample(state, { type: 'phone-start' }), 0.25);
    const beforePause = state;
    state = actOfficeSample(state, { type: 'pause' });
    expect(state).toMatchObject({
      status: 'paused',
      pc: 'entertainment',
      phone: 'stowing',
      activity: 'none',
    });
    expect(updateOfficeSample(state, 1)).toBe(state);
    expect(state.phoneProgress).toBe(beforePause.phoneProgress);
    state = advance(actOfficeSample(state, { type: 'resume' }), 0.4);
    expect(state.phone).toBe('working');
    expect(state.pc).toBe('entertainment');
    expect(state.joy).toBe(beforePause.joy);
    const cancelled = actOfficeSample(actOfficeSample(state, { type: 'phone-start' }), {
      type: 'cancel-input',
    });
    expect(cancelled.pc).toBe('entertainment');
    expect(cancelled.activity).toBe('none');
  });

  it('provides more than full stowing plus 0.8 seconds reaction time on every approach', () => {
    for (const variant of [0, 1, 2]) {
      let state = start(variant);
      let warningAt = -1;
      const windows: number[] = [];
      while (state.elapsed < 75) {
        const previous = state.boss;
        state = updateOfficeSample(state, 0.1);
        if (state.file === 'offered') state = actOfficeSample(state, { type: 'take-file' });
        if (state.boss === 'warning' && previous !== 'warning') warningAt = state.elapsed;
        if (state.boss === 'inspect' && previous !== 'inspect')
          windows.push(state.elapsed - warningAt);
        if (state.questionUntil !== null)
          state = actOfficeSample(state, { type: 'answer', value: 42 });
      }
      expect(windows).toHaveLength(2);
      expect(windows.every((window) => window >= 0.8 + 0.8)).toBe(true);
    }
  });

  it('allows timely stowing and gives a visible recovery question for late stowing', () => {
    let safe = advance(actOfficeSample(start(), { type: 'phone-start' }), 29);
    safe = advance(actOfficeSample(safe, { type: 'phone-stop' }), 2);
    expect(safe.questionUntil).toBeNull();
    expect(safe.status).toBe('playing');
    let late = advance(actOfficeSample(start(), { type: 'phone-start' }), 30.4);
    expect(late.boss).toBe('question');
    expect(late.event).toBe('evidence');
    const blocked = actOfficeSample(late, { type: 'answer', value: 42 });
    expect(blocked.questionUntil).not.toBeNull();
    late = advance(actOfficeSample(late, { type: 'phone-stop' }), 0.8);
    late = actOfficeSample(late, { type: 'answer', value: 42 });
    expect(late).toMatchObject({ status: 'playing', boss: 'leave', questionAnswered: true });
    expect(late.questionUntil).toBeNull();
  });

  it('detects both evidence sources and catches unresolved or factually incorrect answers', () => {
    for (const type of ['pc-entertainment', 'phone-start'] as const) {
      const state = advance(actOfficeSample(start(), { type }), 35);
      expect(state.status).toBe('caught');
      expect(state.elapsed).toBeCloseTo(34.35, 7);
    }
    let state = advance(start(), 62);
    expect(state.questionUntil).toBe(68);
    const paused = actOfficeSample(state, { type: 'pause' });
    expect(updateOfficeSample(paused, 1).questionUntil).toBe(68);
    state = actOfficeSample(state, { type: 'answer', value: 41 });
    expect(state.status).toBe('caught');
  });

  it('resolves observation and mid-motion boundaries identically at both frame rates', () => {
    const results = [30, 60].map((fps) => {
      let state = advance(actOfficeSample(start(), { type: 'phone-start' }), 30.1, fps);
      state = advance(actOfficeSample(state, { type: 'phone-stop' }), 0.8, fps);
      expect(state).toMatchObject({ boss: 'question', phone: 'working' });
      expect(state.questionUntil).toBeCloseTo(34.35, 7);
      return actOfficeSample(state, { type: 'answer', value: 42 });
    });
    expect(results[0].elapsed).toBeCloseTo(results[1].elapsed, 7);
    expect(results[0].joy).toBeCloseTo(results[1].joy, 7);
    expect(results.every((state) => state.status === 'playing' && state.questionAnswered)).toBe(
      true,
    );
  });

  it('checks the displayed data instead of treating any click as completed work', () => {
    let state = actOfficeSample(createOfficeSample(), { type: 'start' });
    state = actOfficeSample(state, { type: 'confirm-data', value: 41 });
    expect(state.workConfirmed).toBe(false);
    state = advance(state, 62);
    state = actOfficeSample(state, { type: 'answer', value: 42 });
    expect(state.questionUntil).not.toBeNull();
    expect(advance(state, 6).status).toBe('caught');
  });

  it('requires confirmed work, enough joy and clean evidence at the deadline', () => {
    let state = advance(start(), 62);
    state = actOfficeSample(state, { type: 'answer', value: 42 });
    expect(advance(state, 28).status).toBe('failed');
    state = advance(actOfficeSample(start(), { type: 'pc-entertainment' }), 20);
    state = advance(actOfficeSample(state, { type: 'pc-work' }), 42);
    state = actOfficeSample(state, { type: 'answer', value: 42 });
    state = advance(actOfficeSample(state, { type: 'phone-start' }), 28);
    expect(state.status).toBe('failed');
    expect(actOfficeSample(state, { type: 'confirm-data', value: 42 })).toBe(state);
  });

  it('keeps fast stowing continuous, audible and stable under repeated input at both frame rates', () => {
    for (const fps of [30, 60]) {
      let state = advance(actOfficeSample(start(), { type: 'phone-start' }), 29.7, fps);
      state = actOfficeSample(state, { type: 'phone-stop-fast' });
      expect(state.noiseUntil).toBeCloseTo(30.4, 7);
      const event = state.eventId;
      state = advance(state, 0.1, fps);
      expect(state.phoneProgress).toBeCloseTo(0.75, 7);
      state = actOfficeSample(state, { type: 'phone-stop-fast' });
      expect(state.eventId).toBe(event);
      expect(state.noiseUntil).toBeCloseTo(30.4, 7);
      state = advance(state, 0.6, fps);
      expect(state).toMatchObject({ phone: 'working', boss: 'question' });
      expect(state.questionUntil).toBeCloseTo(34.35, 7);
      expect(state.feedback).toContain('听到了手机的响动');
      expect(actOfficeSample(state, { type: 'answer', value: 42 }).status).toBe('playing');
    }
  });

  it('returns to normal cleanup on cancellation without erasing noise or changing pose', () => {
    let state = advance(actOfficeSample(start(), { type: 'phone-start' }), 0.2);
    state = advance(actOfficeSample(state, { type: 'phone-stop-fast' }), 0.08);
    expect(state.phoneProgress).toBeCloseTo(0.2);
    const noise = state.noiseUntil;
    state = actOfficeSample(state, { type: 'cancel-input' });
    expect(state.phoneStowFast).toBe(false);
    expect(state.noiseUntil).toBe(noise);
    state = advance(state, 0.16);
    expect(state).toMatchObject({ phone: 'working', status: 'playing', questionUntil: null });
  });

  it('offers one visible vibration and allows silence before the announced ring at either frame rate', () => {
    for (const fps of [30, 60]) {
      const offered = advance(start(2), 40, fps);
      expect(offered).toMatchObject({
        phoneNotice: 'vibrating',
        notifyUntil: 44,
        phone: 'working',
      });
      let quiet = actOfficeSample(advance(offered, 3, fps), { type: 'silence-phone' });
      quiet = advance(quiet, 2, fps);
      expect(quiet).toMatchObject({ phoneNotice: 'silenced', noiseUntil: 0 });
      let rang = advance(offered, 4, fps);
      expect(rang).toMatchObject({
        phoneNotice: 'sounded',
        event: 'phone-ring',
        status: 'playing',
      });
      expect(rang.noiseUntil).toBeCloseTo(44.7, 7);
      const event = rang.eventId;
      rang = advance(rang, 2, fps);
      expect(rang.eventId).toBe(event);
      expect(rang.questionUntil).toBeNull();
    }
  });

  it('requires a free hand for files and lets a missed handoff be rechecked before winning', () => {
    for (const fps of [30, 60]) {
      let state = advance(start(1), 40, fps);
      expect(state).toMatchObject({ file: 'offered', fileUntil: 47 });
      state = advance(actOfficeSample(state, { type: 'phone-start' }), 0.5, fps);
      expect(actOfficeSample(state, { type: 'take-file' }).file).toBe('offered');
      state = advance(actOfficeSample(state, { type: 'phone-stop-fast' }), 0.4, fps);
      state = advance(actOfficeSample(state, { type: 'take-file' }), 7, fps);
      expect(state).toMatchObject({ file: 'accepted', workConfirmed: true });
      state = advance(actOfficeSample(start(1), { type: 'pc-entertainment' }), 20, fps);
      state = advance(actOfficeSample(state, { type: 'pc-work' }), 27, fps);
      expect(state).toMatchObject({ file: 'missed', workConfirmed: false, status: 'playing' });
      state = advance(actOfficeSample(state, { type: 'confirm-data', value: 42 }), 18, fps);
      state = advance(actOfficeSample(state, { type: 'answer', value: 42 }), 25, fps);
      expect(state.status).toBe('won');
      expect(actOfficeSample(state, { type: 'restart' })).toMatchObject({
        variant: 2,
        phoneNotice: 'none',
        file: 'none',
        noiseUntil: 0,
      });
    }
  });
});
