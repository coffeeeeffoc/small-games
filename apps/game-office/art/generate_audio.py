"""Original procedural office Foley and ambient beds; no third-party samples.

Run: python apps/game-office/art/generate_audio.py
These are synthesized placeholders for location recordings, not recorded actor performances.
"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parents[1] / "public" / "office-scene" / "audio"


def write(name, duration, synth):
    rng = random.Random(name)
    samples = []
    low = 0.0
    for i in range(round(duration * RATE)):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        low += 0.06 * (noise - low)
        samples.append(max(-0.92, min(0.92, synth(t, noise, low))))
    # Boundaries are silent so every reusable event avoids clicks.
    fade = min(round(RATE * 0.012), len(samples) // 4)
    for i in range(fade):
        samples[i] *= i / fade
        samples[-i - 1] *= i / fade
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / (name + ".wav")), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(struct.pack("<" + "h" * len(samples), *(round(s * 32767) for s in samples)))
    assert samples and max(abs(s) for s in samples) <= 0.92


def sine(hz, t):
    return math.sin(2 * math.pi * hz * t)


def decay(t, start, speed):
    return math.exp(-(t - start) * speed) if t >= start else 0


write("room", 8, lambda t, n, l:
      (0.19 * l + 0.008 * sine(100, t) + 0.004 * sine(151, t))
      * (0.8 + 0.12 * sine(0.25, t)))
write("steps", 0.35, lambda t, n, l:
      sum((0.45 * l + 0.15 * sine(82, t - start)) * decay(t, start, 23)
          + 0.04 * n * decay(t, start + 0.055, 32) for start in (0.015,)))
write("keyboard", 0.8, lambda t, n, l:
      sum((0.21 * n + 0.08 * sine(430, t)) * decay(t, start, 85)
          for start in (0.025, 0.17, 0.25, 0.42, 0.55, 0.68)))
write("mouse", 0.15, lambda t, n, l:
      (0.33 * n + 0.06 * sine(730, t)) * (decay(t, 0.01, 180) + 0.6 * decay(t, 0.07, 200)))
write("phone", 0.7, lambda t, n, l:
      0.09 * n * max(0, math.sin(math.pi * min(1, t / 0.5))) ** 3
      )
write("contact", 0.18, lambda t, n, l: (0.5 * l + 0.1 * sine(170, t)) * decay(t, 0.015, 48))
write("chair", 0.65, lambda t, n, l:
      (0.3 * l + 0.009 * sine(970 + 20 * math.sin(6 * t), t))
      * max(0, math.sin(math.pi * t / 0.65)))
write("buzz", 0.75, lambda t, n, l:
      (0.08 * sine(143, t) + 0.035 * sine(286, t) + 0.04 * l)
      * (1 if 0.03 < t < 0.27 or 0.4 < t < 0.64 else 0))
write("breath", 0.95, lambda t, n, l:
      (0.045 * n + 0.16 * l) * max(0, math.sin(math.pi * t / 0.95)) ** 2)
write("ring", 0.5, lambda t, n, l:
      (0.1 * sine(880, t) + 0.05 * sine(1320, t))
      * (decay(t, 0.02, 14) + decay(t, 0.23, 18)))
write("tension", 4, lambda t, n, l:
      (0.04 * sine(73.416, t) + 0.026 * sine(110, t) + 0.012 * sine(155.56, t))
      * (0.55 + 0.35 * math.cos(2 * math.pi * t))
      * min(1, t / 0.25, (4 - t) / 0.25))
write("relief", 1.5, lambda t, n, l:
      sum(0.07 * sine(hz, t) * decay(t, start, 3.5)
          for hz, start in ((220, 0.02), (329.628, 0.18), (440, 0.34))))

print(f"Generated {len(list(OUT.glob('*.wav')))} bounded mono sound files in {OUT}")
