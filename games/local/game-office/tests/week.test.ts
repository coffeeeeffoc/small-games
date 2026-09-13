import { describe, expect, it } from 'vitest';

import { createWeek, formatTime, SCENES, WEEKDAYS } from '../src/week.js';

describe('first-person office week', () => {
  it('replays the same seed and produces a different new week', () => {
    expect(createWeek(20260912)).toEqual(createWeek(20260912));
    expect(createWeek(20260913)).not.toEqual(createWeek(20260912));
    expect(createWeek(-1).seed).toBe(4294967295);
    expect(formatTime(9 * 60 + 8)).toBe('09:08');
    expect(formatTime(18 * 60)).toBe('18:00');
  });

  it('keeps five varied workdays ordered from arrival through the end of the day', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const week = createWeek(seed);
      expect(week.days.map((day) => day.label)).toEqual(WEEKDAYS);
      expect(week.days[0].scenes[0].sceneId).toBe('late-arrival');
      const combinations = new Set<string>();
      for (const day of week.days) {
        expect(day.scenes).toHaveLength(5);
        expect(
          day.scenes.map((entry) => SCENES.find((scene) => scene.id === entry.sceneId)?.period),
        ).toEqual(['arrival', 'morning', 'lunch', 'afternoon', 'evening']);
        combinations.add(day.scenes.map((entry) => entry.sceneId).join('/'));
        day.scenes.forEach((entry, index) => {
          expect(entry.startMinute).toBeLessThan(entry.endMinute);
          if (index > 0) expect(entry.startMinute).toBeGreaterThan(day.scenes[index - 1].endMinute);
        });
      }
      expect(combinations.size).toBe(5);
    }
  });

  it('labels only the implemented scene playable and keeps unique catalogue identities', () => {
    expect(SCENES.filter((scene) => scene.status === 'playable').map((scene) => scene.id)).toEqual([
      'late-arrival',
    ]);
    expect(new Set(SCENES.map((scene) => scene.id)).size).toBe(SCENES.length);
    for (const scene of SCENES) {
      expect(scene.interaction.length).toBeGreaterThan(10);
      expect(scene.fun.length).toBeGreaterThan(10);
    }
  });
});
