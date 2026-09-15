// Procedural, locally generated ambience: no remote audio or autoplay dependency.
let context: AudioContext | undefined,
  master: GainNode | undefined,
  wind: BiquadFilterNode | undefined;
let enabled = false,
  lastStep = 0;
let traffic: GainNode | undefined,
  trafficPan: StereoPannerNode | undefined,
  lastHorn = 0;
export async function setAudio(on: boolean) {
  enabled = on;
  if (on && !context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate),
      data = buffer.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      smooth = (smooth + (Math.random() * 2 - 1) * 0.03) / 1.03;
      data[i] = smooth * 4;
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    wind = context.createBiquadFilter();
    wind.type = 'lowpass';
    wind.frequency.value = 430;
    noise.connect(wind).connect(master);
    noise.start();
    traffic = context.createGain();
    traffic.gain.value = 0;
    trafficPan = context.createStereoPanner();
    const motor = context.createBiquadFilter();
    motor.type = 'bandpass';
    motor.frequency.value = 110;
    motor.Q.value = 0.8;
    noise.connect(motor).connect(traffic).connect(trafficPan).connect(master);
    const lfo = context.createOscillator(),
      gain = context.createGain();
    lfo.frequency.value = 0.09;
    gain.gain.value = 90;
    lfo.connect(gain).connect(wind.frequency);
    lfo.start();
  }
  if (on) await context?.resume();
  master?.gain.setTargetAtTime(on ? 0.16 : 0, context!.currentTime, 0.2);
}
export function spatialAudio(
  position: readonly number[],
  yaw: number,
  boats: readonly { position: readonly number[] }[],
  cars: readonly { position: readonly number[] }[],
) {
  if (!context || !master || !enabled) return;
  const nearest = (items: readonly { position: readonly number[] }[]) =>
    items
      .map((p) => ({ dx: p.position[0] - position[0], dz: p.position[2] - position[2] }))
      .sort((a, b) => Math.hypot(a.dx, a.dz) - Math.hypot(b.dx, b.dz))[0];
  const car = nearest(cars),
    boat = nearest(boats),
    now = context.currentTime;
  if (car && traffic && trafficPan) {
    const d = Math.hypot(car.dx, car.dz);
    traffic.gain.setTargetAtTime(0.8 / (1 + d / 18), now, 0.3);
    trafficPan.pan.setTargetAtTime(
      Math.max(-1, Math.min(1, (car.dx * Math.cos(yaw) - car.dz * Math.sin(yaw)) / Math.max(1, d))),
      now,
      0.3,
    );
  }
  if (boat && now - lastHorn > 24 && Math.hypot(boat.dx, boat.dz) < 650) {
    lastHorn = now;
    const pan = context.createStereoPanner();
    pan.pan.value = Math.max(
      -1,
      Math.min(
        1,
        (boat.dx * Math.cos(yaw) - boat.dz * Math.sin(yaw)) /
          Math.max(1, Math.hypot(boat.dx, boat.dz)),
      ),
    );
    pan.connect(master);
    const osc = context.createOscillator(),
      gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = 116;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15 / (1 + Math.hypot(boat.dx, boat.dz) / 100), now + 0.4);
    gain.gain.linearRampToValueAtTime(0, now + 2.2);
    osc.connect(gain).connect(pan);
    osc.start();
    osc.stop(now + 2.3);
    osc.onended = () => {
      gain.disconnect();
      pan.disconnect();
    };
  }
}
export function audioActivity(active: boolean) {
  if (master && context)
    master.gain.setTargetAtTime(enabled && active ? 0.16 : 0, context.currentTime, 0.15);
}
export function footstep(speed: number) {
  if (!context || !master || !enabled || context.currentTime - lastStep < (speed > 3 ? 0.29 : 0.48))
    return;
  lastStep = context.currentTime;
  const osc = context.createOscillator(),
    gain = context.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(90, lastStep);
  osc.frequency.exponentialRampToValueAtTime(35, lastStep + 0.09);
  gain.gain.setValueAtTime(0.035, lastStep);
  gain.gain.exponentialRampToValueAtTime(0.0001, lastStep + 0.12);
  osc.connect(gain).connect(master);
  osc.start();
  osc.stop(lastStep + 0.13);
}
export function chime() {
  if (!context || !master || !enabled) return;
  const t = context.currentTime;
  for (const [i, hz] of [523.25, 659.25, 783.99].entries()) {
    const osc = context.createOscillator(),
      g = context.createGain();
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0, t + i * 0.08);
    g.gain.linearRampToValueAtTime(0.09, t + i * 0.08 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 + i * 0.08);
    osc.connect(g).connect(master);
    osc.start(t + i * 0.08);
    osc.stop(t + 0.7 + i * 0.08);
  }
}
