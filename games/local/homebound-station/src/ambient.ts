// Visual-only poses follow simulation time: pause/retry are deterministic and never change queue membership.
export function idlePose(id: string, time: number) {
  const hash = [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const seed = (Math.imul(hash, 0x45d9f3b) ^ (hash >>> 16)) >>> 0;
  const phase = (time + (seed % 180) / 10) % 18;
  const angle = phase / 18 * Math.PI * 2;
  const pace = phase >= 6 && phase < 12;
  const step = pace ? Math.sin((phase - 6) / 6 * Math.PI * 2) : 0;
  const blend = pace ? Math.sin((phase - 6) / 6 * Math.PI) : 0;
  return {
    z: step * 0.2, turn: step * 0.28 * blend + Math.sin(angle + seed) * 0.3 * (1 - blend),
    stride: pace ? Math.sin(phase * 9) * 0.28 * blend : 0,
    arm: phase < 6 ? Math.sin(phase * 1.8 + seed) * 0.16 * Math.sin(phase / 6 * Math.PI) : phase > 13 ? 0.45 * Math.sin((phase - 13) / 5 * Math.PI) : 0,
    nod: Math.sin(angle * 4 + seed) * 0.035,
  };
}
