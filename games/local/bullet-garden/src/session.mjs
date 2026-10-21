import {
  createGame,
  startGame,
  step,
  pauseGame,
  resumeGame,
  chooseUpgrade,
} from './simulation.mjs';
import { createProfile, isLevelUnlocked, settleLevel } from './progression.mjs';

export const SAVE_KEY = 'bullet-garden.profile.v1';

/** Owns navigation and ad leases; simulation remains the only combat authority. */
export class GardenSession {
  constructor({ profile, provider = null, adAvailable = () => false, save = () => {} } = {}) {
    this.profile = createProfile(profile);
    this.provider = provider;
    this.adAvailable = adAvailable;
    this.save = save;
    this.screen = 'home';
    this.state = null;
    this.epoch = 0;
    this.pending = null;
    this.used = { revive: false, supply: false };
    this.result = null;
    this.adStatus = '';
    this.disposed = false;
    this.hidden = false;
  }
  cancelAd() {
    this.epoch++;
    this.pending = null;
    this.provider?.cancel?.();
  }
  begin(levelId, { dev = false, seed = Date.now() >>> 0 } = {}) {
    if (this.disposed || (!dev && !isLevelUnlocked(this.profile, levelId))) return false;
    this.cancelAd();
    this.state = createGame(levelId, seed, this.profile, { dev });
    this.state.runId = `garden-${Date.now().toString(36)}-${this.epoch}-${Math.random().toString(36).slice(2, 10)}`;
    startGame(this.state);
    this.used = { revive: false, supply: false };
    this.result = null;
    this.adStatus = '';
    this.screen = 'playing';
    return true;
  }
  tick(dt, input) {
    if (this.screen !== 'playing' || this.pending || this.disposed || this.hidden) return;
    step(this.state, dt, input);
    if (this.state.phase === 'upgrade') this.screen = 'upgrade';
    if (this.state.phase === 'lost') this.screen = 'failed';
    if (this.state.phase === 'won') this.finish();
  }
  upgrade(id) {
    if (this.screen !== 'upgrade' || !chooseUpgrade(this.state, id)) return false;
    this.screen = this.state.phase === 'upgrade' ? 'upgrade' : 'playing';
    return true;
  }
  pause() {
    if (this.screen === 'playing' && pauseGame(this.state)) this.screen = 'paused';
  }
  resume() {
    if (!this.hidden && !this.pending && this.screen === 'paused' && resumeGame(this.state))
      this.screen = 'playing';
  }
  suspend({ nativeAdTransition = false } = {}) {
    this.hidden = true;
    // An acknowledged SDK overlay owns this pause until visibility returns.
    if (this.pending && !this.pending.shown && !nativeAdTransition) {
      this.cancelAd();
      this.adStatus = '已取消补给，可继续冒险';
    }
    this.pause();
  }
  show() {
    this.hidden = false;
    if (this.pending?.result) this.deliver(this.pending, this.pending.result);
  }
  finish() {
    if (!this.state || !['won', 'lost'].includes(this.state.phase)) return false;
    this.cancelAd();
    if (!this.result) {
      this.result = settleLevel(this.profile, this.state);
      if (this.result.ok) this.save(this.profile);
    }
    this.screen = 'result';
    return true;
  }
  home() {
    this.cancelAd();
    this.state = null;
    this.screen = 'home';
  }
  eligible(kind) {
    if (
      this.disposed ||
      this.hidden ||
      this.pending ||
      !this.state ||
      !this.adAvailable() ||
      this.used[kind]
    )
      return false;
    if (kind === 'revive') return this.screen === 'failed' && this.state.phase === 'lost';
    return (
      kind === 'supply' &&
      this.screen === 'paused' &&
      this.state.phase === 'paused' &&
      this.state.player.hp > 0 &&
      this.state.player.hp < this.state.player.maxHp
    );
  }
  async reward(kind) {
    if (!this.eligible(kind)) return { status: 'unavailable' };
    const lease = { epoch: this.epoch, state: this.state, kind, screen: this.screen, shown: false };
    this.pending = lease;
    this.adStatus = '补给准备中…';
    let result;
    try {
      result = await this.provider.show({
        kind: 'rewarded',
        placement: kind,
        onShown: () => {
          if (this.pending === lease) lease.shown = true;
        },
      });
    } catch {
      result = { status: 'failed' };
    }
    if (
      this.disposed ||
      this.pending !== lease ||
      this.epoch !== lease.epoch ||
      this.state !== lease.state ||
      this.screen !== lease.screen
    )
      return { status: 'dismissed' };
    if (this.hidden) {
      lease.result = result;
      return result;
    }
    this.deliver(lease, result);
    return result;
  }
  deliver(lease, result) {
    if (
      this.pending !== lease ||
      this.epoch !== lease.epoch ||
      this.state !== lease.state ||
      this.screen !== lease.screen ||
      this.disposed
    )
      return;
    const { kind } = lease;
    this.pending = null;
    if (result.status === 'completed' && !this.used[kind]) {
      this.used[kind] = true;
      const player = this.state.player;
      if (kind === 'revive') {
        player.hp = Math.max(1, player.maxHp * 0.5);
        player.invulnerable = 3;
        this.state.phase = 'paused';
        this.screen = 'paused';
      } else player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
      this.adStatus = '补给已送达';
    } else
      this.adStatus =
        result.status === 'dismissed' ? '已取消，未消耗补给机会' : '补给暂不可用，可正常继续';
  }
  dispose() {
    this.cancelAd();
    this.disposed = true;
    this.provider?.dispose?.();
  }
}
