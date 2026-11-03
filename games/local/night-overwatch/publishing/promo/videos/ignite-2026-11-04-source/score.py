"""Original 120 BPM electronic trailer score. No external recordings or samples.

Usage: python score.py OUTPUT.wav (requires numpy)
"""
import sys
import wave
from pathlib import Path
import numpy as np

RATE, DURATION, BEAT = 48000, 30, 0.5
rng = np.random.default_rng(20261104)
mix = np.zeros((RATE * DURATION, 2), dtype=np.float64)


def time(length):
    return np.arange(round(length * RATE)) / RATE


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def smooth(a, width):
    sums = np.cumsum(np.r_[0, a])
    return (sums[width:] - sums[:-width]) / width


def add(at, signal, gain=1, pan=0, echo=False):
    first = round(at * RATE)
    assert first >= 0
    count = min(len(signal), len(mix) - first)
    if count <= 0:
        return
    stereo = np.array([np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)])
    mix[first:first + count] += signal[:count, None] * stereo * gain
    if echo:
        for delay, level in [(0.1875, .21), (.375, .11)]:
            add(at + delay, signal, gain * level, -pan)


def synth(note, length, kind):
    t = time(length)
    f = hz(note)
    if kind == 'bass':
        wavelet = sum(np.sin(2 * np.pi * f * h * t) / h for h in range(1, 9))
        wavelet = .7 * np.tanh(wavelet * 2) + .3 * np.sin(2 * np.pi * f * t)
        envelope = np.minimum(1, t / .004) * np.exp(-t * 4)
    else:
        wavelet = sum(
            np.sin(2 * np.pi * f * detune * h * t) / h ** 1.5
            for detune in [.998, 1.002] for h in range(1, 7)
        ) / 2
        envelope = np.minimum(1, t / .018) * np.exp(-t * (2 if kind == 'lead' else .3))
    envelope *= np.minimum(1, (length - t) / .04)
    return wavelet * envelope


def drum(kind):
    length = {'kick': .45, 'snare': .28, 'hat': .08, 'crash': 1.5, 'tom': .35}[kind]
    t = time(length)
    noise = rng.uniform(-1, 1, len(t))
    if kind == 'kick':
        body = np.sin(2 * np.pi * (47 * t + 3.2 * (1 - np.exp(-t * 42))))
        return np.tanh(1.8 * body) * np.exp(-t * 13) + noise * np.exp(-t * 240) * .12
    if kind == 'snare':
        high = np.r_[0, np.diff(noise)] / 2
        return (.7 * high + .4 * np.sin(2 * np.pi * 185 * t) * np.exp(-t * 25)) * np.exp(-t * 13)
    if kind == 'tom':
        return np.sin(2 * np.pi * (70 * t + 2 * (1 - np.exp(-t * 20)))) * np.exp(-t * 14)
    high = np.r_[0, np.diff(noise)]
    metallic = sum(np.sin(2 * np.pi * f * t) for f in [3701, 5227, 6917]) / 3
    return (high * .35 + metallic * .15) * np.exp(-t * (55 if kind == 'hat' else 4))


# D minor / Bb / F / C: each chord lasts two bars; sidechain leaves room for the kick.
roots = [38, 34, 41, 36]
for bar in range(14):
    at = bar * 2
    root = roots[(bar // 2) % 4]
    intervals = [0, 3, 7] if root == 38 else [0, 4, 7]
    for j, interval in enumerate(intervals):
        chord = synth(root + 24 + interval, 2.6, 'pad')
        t = time(2.6)
        duck = .4 + .6 * np.minimum(1, (t % BEAT) / .18)
        add(at, chord * duck, .085 if at < 13 else .13, (j - 1) * .6)
    if at < 28:
        for step in range(16):
            note = root + (12 if step in [6, 14] else 0)
            add(at + step * .125, synth(note, .115, 'bass'), .19 if at < 4 else .30)
        for step in range(8):
            note = root + 36 + [0, 7, 12, 7, 3 if root == 38 else 4, 7, 12, 19][step]
            add(at + step * .25, synth(note, .22, 'lead'), .055 if at < 10 else .09, .65 * (-1) ** step, True)

# Kick/snare backbeat, double-time hats, then larger chorus and end-of-phrase fills.
for beat in range(56):
    at = beat * BEAT
    gain = .68 if at >= 13 else .48
    if beat % 4 in [0, 2] or at >= 13:
        add(at, drum('kick'), gain)
    if beat % 2 == 1 and at >= 4:
        add(at, drum('snare'), .65 if at >= 13 else .42, .07, True)
    if at >= 2:
        for sub in range(2 if at < 13 else 4):
            add(at + sub * (.25 if at < 13 else .125), drum('hat'), .1 if sub % 2 == 0 else .055, .4 * (-1) ** sub)
for at in [7.5, 12, 17.5, 22.5, 27]:
    for step in range(4):
        add(at + step * .125, drum('tom' if step < 2 else 'snare'), .25 + step * .07, -.5 + step / 3)

# A new eight-note motif, doubled in octaves at the final brand reveal.
melody = [74, 77, 81, 79, 77, 74, 72, 69]
for start, repeats, level in [(13, 2, .16), (23, 1, .2)]:
    for phrase in range(repeats):
        for step, note in enumerate(melody):
            at = start + phrase * 4 + step * .5
            add(at, synth(note, .48, 'lead'), level, -.15, True)
            if start == 23:
                add(at, synth(note - 12, .48, 'lead'), .1, .25, True)

# Each picture cut gets a short stereo sweep and downbeat impact.
for cut in [4, 7, 10, 13, 18, 23]:
    t = time(.65)
    air = smooth(rng.uniform(-1, 1, len(t) + 5), 6)
    add(cut - .65, air * (t / .65) ** 2, .35, -.55)
    add(cut, drum('crash'), .3, .6)
    add(cut, drum('kick'), .35)
    tail = time(1.2)
    add(cut, np.sin(2 * np.pi * 36 * tail) * np.exp(-tail * 5), .35)
for note in [50, 57, 62, 65, 69]:
    add(28, synth(note, 2, 'pad'), .12, (note - 60) / 25)
add(28, drum('crash'), .35, -.3)
add(28, drum('kick'), .7)

# Short stereo room reflections preserve attack; master headroom is normalized later.
dry = mix.copy()
for seconds, level in [(.041, .12), (.073, .09), (.113, .06)]:
    offset = round(seconds * RATE)
    mix[offset:] += dry[:-offset, ::-1] * level
t = time(DURATION)
mix *= (np.minimum(1, t / .04) * np.minimum(1, (DURATION - t) / 1.2))[:, None]
assert np.isfinite(mix).all() and np.max(np.abs(mix)) > 0
mix = np.tanh(mix * 1.15)
mix *= .89 / np.max(np.abs(mix))
assert mix.shape == (1440000, 2) and not np.array_equal(mix[:, 0], mix[:, 1])
assert np.max(np.abs(mix)) < 1 and np.sqrt(np.mean(mix[10 * RATE:20 * RATE] ** 2)) > .05
output = Path(sys.argv[1])
output.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(output), 'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes((mix * 32767).astype('<i2').tobytes())
print(f'{output}: {DURATION}s, {RATE}Hz stereo, peak {np.max(np.abs(mix)):.3f}')
