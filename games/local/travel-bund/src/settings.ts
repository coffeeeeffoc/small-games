export const SETTINGS_KEY = 'travel-bund.settings.v1';
export function readSettings(raw: string | null, touch: boolean, reducedMotion = false) {
  const defaults = {
    night: false,
    sound: true,
    quality: touch ? 0 : 1,
    sensitivity: 1,
    crowd: true,
    motion: !reducedMotion,
  };
  try {
    const saved: unknown = JSON.parse(raw || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    const s = saved as Record<string, unknown>;
    return {
      night: typeof s.night === 'boolean' ? s.night : defaults.night,
      sound: typeof s.sound === 'boolean' ? s.sound : defaults.sound,
      quality:
        typeof s.quality === 'number' && [0, 1, 2].includes(s.quality)
          ? s.quality
          : defaults.quality,
      sensitivity:
        typeof s.sensitivity === 'number' &&
        Number.isFinite(s.sensitivity) &&
        s.sensitivity >= 0.4 &&
        s.sensitivity <= 2
          ? s.sensitivity
          : 1,
      crowd: typeof s.crowd === 'boolean' ? s.crowd : true,
      motion: typeof s.motion === 'boolean' ? s.motion : defaults.motion,
    };
  } catch {
    return defaults;
  }
}
