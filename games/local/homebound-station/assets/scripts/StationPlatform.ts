import { AudioClip, AudioSource, Node, resources, screen, sys } from 'cc';
import { readProgress, type Progress, type RewardProvider } from './core/session';
const KEY = 'homebound-station.progress.v2';
type Bridge = typeof globalThis & {
  SmallGamesDev?: {
    isEnabled(): boolean;
    registerActions?(actions: { id: string; label: string; run: () => void }[]): () => void;
  };
  SmallGamesRewardAds?: RewardProvider;
  SmallGamesPublishingConfig?: { adsEnabled?: boolean };
};
export class StationPlatform {
  async share(level: number) {
    const share = (
      globalThis as typeof globalThis & {
        HomeboundShare?: (id: number) => Promise<{ status: string; url: string }>;
      }
    ).HomeboundShare;
    if (!share) return '当前平台暂不支持分享';
    let result: { status: string; url: string };
    try {
      result = await share(level);
    } catch {
      return '分享暂不可用，请稍后再试';
    }
    return result.status === 'shared'
      ? '已打开分享面板'
      : result.status === 'copied'
        ? '同班邀请链接已复制'
        : result.status === 'cancelled'
          ? '已取消分享'
          : '当前浏览器不支持分享或复制';
  }
  progress: Progress;
  storageWarning = '';
  private voices = new Map<string, AudioSource>();
  private active = false;
  constructor(parent: Node, count: number) {
    let raw: string | null = null;
    try {
      raw = sys.localStorage.getItem(KEY);
    } catch {
      /* Optional storage. */
    }
    this.progress = readProgress(raw, count);
    for (const id of ['tap', 'depart', 'board', 'win', 'blocked']) {
      const node = new Node(`Sound:${id}`);
      parent.addChild(node);
      const source = node.addComponent(AudioSource);
      source.playOnAwake = false;
      source.volume = 0.22;
      this.voices.set(id, source);
      resources.load(`audio/${id}`, AudioClip, (error, clip) => {
        if (!error && node.isValid) source.clip = clip;
      });
    }
  }
  get developer() {
    try {
      return sys.isBrowser && !!(globalThis as Bridge).SmallGamesDev?.isEnabled();
    } catch {
      return false;
    }
  }
  get ads() {
    return (globalThis as Bridge).SmallGamesPublishingConfig?.adsEnabled === false
      ? undefined
      : (globalThis as Bridge).SmallGamesRewardAds;
  }
  activate() {
    this.active = true;
  }
  play(id: string) {
    const sound = this.voices.get(id);
    if (this.active && this.progress.sound && sound?.clip) {
      sound.stop();
      sound.play();
    }
  }
  stop() {
    for (const source of this.voices.values()) source.stop();
  }
  save() {
    try {
      sys.localStorage.setItem(KEY, JSON.stringify(this.progress));
      this.storageWarning = '';
    } catch {
      this.storageWarning = '本次进度暂存于当前页面';
    }
  }
  async fullscreen() {
    if (!sys.isBrowser) return false;
    try {
      if (screen.fullScreen()) await screen.exitFullScreen();
      else await screen.requestFullScreen();
      return true;
    } catch {
      return false;
    }
  }
  registerLevels(open: () => void) {
    return (
      (globalThis as Bridge).SmallGamesDev?.registerActions?.([
        { id: 'station-levels', label: '归途站 · 任意选关（试玩）', run: open },
      ]) ?? (() => {})
    );
  }
}
