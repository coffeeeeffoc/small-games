import { AudioClip, AudioSource, Node, resources } from 'cc';
import type { RaceManager } from './RaceManager';
export class AudioFeedback {
  source: AudioSource;
  clips = new Map<string, AudioClip>();
  lastPhase = 'ready';
  lastCount = 4;
  lastBoost = 0;
  lastTier = 0;
  lastHit = 0;
  constructor(parent: Node) {
    this.source = parent.addComponent(AudioSource);
    this.source.loop = true;
    this.source.playOnAwake = false;
    for (const name of ['engine', 'tick', 'charge', 'charge2', 'boost', 'hit', 'finish'])
      resources.load('audio/' + name, AudioClip, (error, clip) => {
        if (error) {
          console.warn('[carding-car] audio unavailable', name);
          return;
        }
        this.clips.set(name, clip);
        if (name === 'engine') this.source.clip = clip;
      });
  }
  update(r: RaceManager, muted: boolean) {
    const k = r.drivers[0].kart,
      play = (name: string) => {
        const clip = this.clips.get(name);
        if (clip && !muted) this.source.playOneShot(clip, 0.35);
      };
    const racing = r.phase === 'racing';
    this.source.volume = muted ? 0 : 0.07 + k.speed * 0.003;
    if (racing && !muted && this.source.clip && !this.source.playing) this.source.play();
    if ((!racing || muted) && this.source.playing) this.source.pause();
    const count = Math.ceil(r.countdown);
    if (r.phase === 'countdown' && count !== this.lastCount) play('tick');
    this.lastCount = count;
    if (k.boost > this.lastBoost) play('boost');
    if (k.tier > this.lastTier) play(k.tier === 2 ? 'charge2' : 'charge');
    if (k.collision > this.lastHit && this.lastHit <= 0) play('hit');
    if (r.phase === 'finished' && this.lastPhase !== 'finished') play('finish');
    this.lastPhase = r.phase;
    this.lastBoost = k.boost;
    this.lastTier = k.tier;
    this.lastHit = k.collision;
  }
}
