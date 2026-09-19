import { AudioClip, AudioSource, Node, isValid } from 'cc';
import { loadArt } from './SceneArt';
import type { RaceManager } from './RaceManager';
export class AudioFeedback {
  source: AudioSource;
  effects: AudioSource;
  activated = false;
  clips = new Map<string, AudioClip>();
  lastPhase = 'ready';
  lastCount = 4;
  lastBoost = 0;
  lastTier = 0;
  lastHit = 0;
  lastItem = 0;
  constructor(parent: Node) {
    this.source = parent.addComponent(AudioSource);
    this.source.loop = true;
    this.source.playOnAwake = false;
    const effects = new Node('SoundEffects');
    parent.addChild(effects);
    this.effects = effects.addComponent(AudioSource);
    this.effects.playOnAwake = false;
    this.effects.volume = 0.8;
  }
  private loading = false;
  load() {
    if (this.loading) return;
    this.loading = true;
    for (const name of ['engine', 'tick', 'charge', 'charge2', 'boost', 'hit', 'finish'])
      void loadArt('audio/' + name, AudioClip)
        .then((clip) => {
          if (!isValid(this.source)) return;
          this.clips.set(name, clip);
          if (name === 'engine') this.source.clip = clip;
        })
        .catch(() => {
          this.loading = false;
          console.warn('[carding-car] audio unavailable', name);
        });
  }
  activate(muted: boolean) {
    if (muted) return;
    this.load();
    const clip = this.clips.get('tick');
    if (!this.activated && clip) this.effects.playOneShot(clip, 1);
    this.activated = true;
  }

  update(r: RaceManager, muted: boolean) {
    const k = r.drivers[0].kart,
      play = (name: string) => {
        const clip = this.clips.get(name);
        if (clip && !muted && this.activated) this.effects.playOneShot(clip, 1);
      };
    const racing = r.phase === 'racing';
    this.effects.volume = muted ? 0 : 0.8;
    this.source.volume = muted ? 0 : Math.min(0.65, 0.3 + k.speed * 0.008);
    if (racing && !muted && this.activated && this.source.clip && !this.source.playing)
      this.source.play();
    if ((!racing || muted) && this.source.playing) this.source.pause();
    const count = Math.ceil(r.countdown);
    if (r.phase === 'countdown' && count !== this.lastCount) play('tick');
    this.lastCount = count;
    if (k.boost > this.lastBoost) play('boost');
    if (k.tier > this.lastTier) play(k.tier === 2 ? 'charge2' : 'charge');
    if (k.collision > this.lastHit && this.lastHit <= 0) play('hit');
    if (
      k.itemMessageTime > this.lastItem &&
      k.boost <= this.lastBoost &&
      k.collision <= this.lastHit
    )
      play(k.spin > 0 || k.slip > 0 || k.slow > 0 ? 'hit' : 'charge');
    if (r.phase === 'finished' && this.lastPhase !== 'finished') play('finish');
    this.lastPhase = r.phase;
    this.lastBoost = k.boost;
    this.lastTier = k.tier;
    this.lastHit = k.collision;
    this.lastItem = k.itemMessageTime;
  }
}
