"""Reproduce original local PCM sound assets; no downloaded media or dependencies."""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parents[1] / 'src' / 'assets' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)

def make(name, duration, sample):
    rng = random.Random(name)
    air = 0.0
    values = bytearray()
    for i in range(int(RATE * duration)):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        air = air * .96 + noise * .04
        value = max(-.95, min(.95, sample(t, noise, air)))
        values.extend(struct.pack('<h', round(value * 32767)))
    with wave.open(str(OUT / (name + '.wav')), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        output.writeframes(values)

def tone(t, frequency):
    return math.sin(t * frequency * math.tau)

for name, base in [('cave', 196), ('forest', 220), ('summit', 110)]:
    def ambient(t, n, a, base=base, name=name):
        fade = min(1, t * 4, (8 - t) * 4)
        wind = a * (.8 if name == 'summit' else .35)
        note_time = t % 2
        bell = tone(note_time, base * [2, 3, 4, 3][int(t / 2)]) * math.exp(-note_time * 2.8) * .06
        bird_time = (t + .3) % 1.8
        bird = tone(bird_time, 2300 + 300 * math.sin(bird_time * 28)) * max(0, 1 - bird_time / .18) * (.07 if name == 'forest' else 0)
        return fade * (wind + bell + bird + tone(t, base) * .018)
    make(name, 8, ambient)

make('sword', .34, lambda t,n,a: (n*.16+tone(t, 1500-2000*t)*.16)*math.sin(min(1,t/.34)*math.pi)*math.exp(-t*3))
make('hit', .3, lambda t,n,a: (tone(t,130-150*t)*.6+n*.22)*math.exp(-t*20))
make('stone', .55, lambda t,n,a: (tone(t,1200)*.26+tone(t,1873)*.18+n*.1)*math.exp(-t*11))
make('hurt', .4, lambda t,n,a: (tone(t,90)*.55+n*.16)*math.exp(-t*12))
make('dodge', .28, lambda t,n,a: a*2.2*math.sin(t/.28*math.pi))
make('qi', .7, lambda t,n,a: (tone(t,523)*.18+tone(t,784)*.12+a*.4)*math.sin(t/.7*math.pi)*math.exp(-t*2))
make('scatter', .4, lambda t,n,a: (a*1.6+tone(t,300-400*t)*.1)*math.exp(-t*8))
make('bell', 1.3, lambda t,n,a: (tone(t,784)*.18+tone(t,1176)*.09)*min(1,t*90)*math.exp(-t*3.8))
make('thunder', 1.4, lambda t,n,a: (a*3+tone(t,45)*.15+n*.1)*min(1,t*120)*math.exp(-t*3.5))
make('fox', .5, lambda t,n,a: tone(t,1600+math.sin(t*17)*350)*.12*math.sin(t/.5*math.pi))
make('step', .15, lambda t,n,a: (n*.12+tone(t,90)*.12)*math.exp(-t*40))
make('water', .28, lambda t,n,a: (a*.7+tone(t,680-1100*t)*.07)*math.exp(-t*15))
for name, notes in [('win',[392,523,659,784]),('lose',[330,294,220,196])]:
    make(name, 1.8, lambda t,n,a,notes=notes: sum(tone(t-i*.2,f)*.13*math.exp(-(t-i*.2)*4) for i,f in enumerate(notes) if t>=i*.2))
