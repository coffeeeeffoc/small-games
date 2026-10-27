import { AudioClip, AudioSource, Node, resources, sys } from 'cc';
import type { PauseReason } from './core/Simulation';
import { missionDefinition, type MissionId } from './core/MissionCatalog';
import { newMissionProgress, readMissionProgress, type MissionProgress } from './core/MissionProgress';
import { readTrainingRecord as parseTrainingRecord, type TrainingRecord } from './core/TrainingRecords';
import { readRewards, nextZoomLimit, type RewardKind, type RewardSave, type RewardProvider, type SupplyReward } from './core/Rewards';
import { readMissionTimes, type MissionTimes } from './core/BattleRecords';
export const RADIO = {
  day: ['指挥部：视野良好。拖动准星，清除友军附近的炮位。', 'Command: visibility clear. Drag the sight. Clear guns near our convoy.'],
  night: ['指挥部：进入夜间战区。切换热成像，优先处理红色标记。', 'Command: night operation. Use thermal vision. Prioritize the red marker.'],
  priority: ['车队呼叫！敌方即将开火，优先压制红色标记！', 'Convoy calling! Enemy preparing to fire. Suppress the red marker!'],
  critical: ['紧急呼叫！友军撑不住了，立即处理红色目标！', 'Urgent! Our position is critical. Engage the red target now!'],
  clear: ['收到，威胁已解除。继续掩护友军。', 'Confirmed. Threat eliminated. Keep covering our units.'],
} as const;
export class Platform {
  touchInput = sys.isMobile || (sys.isBrowser && window.matchMedia('(pointer: coarse)').matches);
  muted = false;
  reducedEffects = false;
  activated = false;
  voices = new Map<string, AudioSource>();
  engine: AudioSource;
  radio: AudioSource;
  radioPending = false;
  private radioPaused = false;
  private radioStartWait = 0;
  private radioLastTime = 0;
  private disposed = false;
  clips = new Map<string, AudioClip>();
  audioStatus = 'loading';
  cleanup: (() => void)[] = [];
  rewards: RewardSave = readRewards(null);
  missions: MissionProgress = newMissionProgress();
  times: MissionTimes = {};
  // Install before launch; this may delegate directly to an authorized GameHost.ads.offer.
  rewardProvider?: RewardProvider;
  private readonly rewardPractice = this.developer;
  private readonly rewardStorageKey = this.rewardPractice ? 'night-overwatch-rewards-dev-v1' : 'night-overwatch-rewards-v1';
  private clear: () => void;
  constructor(parent: Node, pause: (reason: PauseReason, on: boolean) => void, clear: () => void) {
    this.clear = clear;
    try {
      this.rewards = readRewards(sys.localStorage.getItem(this.rewardStorageKey));
      this.times = readMissionTimes(sys.localStorage.getItem('night-overwatch-times-v1'));
      this.muted = sys.localStorage.getItem('night-overwatch-muted') === 'true';
      const preference = sys.localStorage.getItem('night-overwatch-reduced-effects');
      this.reducedEffects =
        preference === 'true' ||
        (preference === null &&
          sys.isBrowser &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      /* Preferences never block the mission. */
    }
    const engineNode = new Node('AircraftEngine');
    parent.addChild(engineNode);
    this.engine = engineNode.addComponent(AudioSource);
    this.engine.playOnAwake = false;
    this.engine.loop = true;
    this.engine.volume = 0.13;
    const radioNode = new Node('CommandRadio');
    parent.addChild(radioNode);
    this.radio = radioNode.addComponent(AudioSource);
    this.radio.playOnAwake = false;
    this.radio.volume = .85;
    radioNode.on(AudioSource.EventType.ENDED, () => { this.radioPending = false; this.radioPaused = false; });
    const names = ['rapid', 'blast', 'heavy', 'hit', 'alert', 'impact1', 'impact2', 'engine',
      ...Object.keys(RADIO).flatMap(id => ['zh', 'en'].map(lang => `radio-${id}-${lang}`))];
    let pending = names.length;
    for (const name of names) {
      if (name.startsWith('radio-')) {
        resources.load('audio/' + name, AudioClip, (error, clip) => {
          if (this.disposed) return;
          if (error) this.audioStatus = 'unavailable';
          else this.clips.set(name, clip);
          if (--pending === 0 && this.clips.size === names.length) this.audioStatus = 'ready';
        });
        continue;
      }
      let source = this.engine;
      if (name !== 'engine') {
        const n = new Node('Audio:' + name);
        parent.addChild(n);
        source = n.addComponent(AudioSource);
      }
      source.playOnAwake = false;
      if (name !== 'engine') source.volume = 0.3;
      this.voices.set(name, source);
      resources.load('audio/' + name, AudioClip, (error, clip) => {
        if (this.disposed) return;
        if (error) this.audioStatus = 'unavailable';
        else {
          this.clips.set(name, clip);
          source.clip = clip;
        }
        if (--pending === 0 && this.clips.size === names.length) this.audioStatus = 'ready';
      });
    }
    if (sys.isBrowser) {
      const listen = (target: EventTarget, type: string, fn: EventListener) => {
        target.addEventListener(type, fn);
        this.cleanup.push(() => target.removeEventListener(type, fn));
      };
      listen(window, 'blur', () => {
        clear();
        pause('focus', true);
      });
      listen(window, 'focus', () => pause('focus', false));
      listen(document, 'visibilitychange', () => {
        clear();
        pause('background', document.hidden);
      });
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', '夜航守望：点击进入，H 查看操作帮助');
        listen(canvas, 'pointerdown', (e) => {
          this.useTouchInput((e as PointerEvent).pointerType !== 'mouse');
          canvas.focus({ preventScroll: true });
          this.activate();
        });
        listen(canvas, 'pointermove', (e) => {
          this.useTouchInput((e as PointerEvent).pointerType !== 'mouse');
        });
        listen(canvas, 'pointerleave', (e) => {
          if ((e as PointerEvent).pointerType === 'mouse') clear();
        });
        listen(canvas, 'pointercancel', () => clear());
        listen(canvas, 'contextmenu', (e) => e.preventDefault());
      }
    }
  }
  useTouchInput(touch: boolean) {
    if (touch === this.touchInput) return;
    this.clear();
    this.touchInput = touch;
  }
  get focused() {
    return (
      !sys.isBrowser ||
      (!document.hidden &&
        document.hasFocus() &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || ''))
    );
  }
  activate() {
    this.activated = true;
  }
  savePreferences() {
    try {
      sys.localStorage.setItem('night-overwatch-muted', String(this.muted));
      sys.localStorage.setItem('night-overwatch-reduced-effects', String(this.reducedEffects));
    } catch {
      /* Optional local preferences. */
    }
  }
  lastSound = '';
  play(id: string, gain = 1) {
    if (id === 'incendiary') id = 'heavy';
    if (id === 'impact3') id = 'impact2';
    const source = this.voices.get(id);
    if (source?.clip && this.activated && !this.muted) {
      source.volume = (id === 'heavy' ? .7 : id === 'blast' ? .5 : id === 'rapid' ? .32 : .3) * gain;
      this.lastSound = id;
      source.stop();
      source.play();
    }
  }
  stop(preserveRadio = false) {
    if (preserveRadio && this.radioPending) {
      if (!this.radioPaused) this.radio.pause();
      this.radioPaused = true;
    } else this.stopRadio();
    for (const source of Array.from(this.voices.values())) source.stop();
  }
  stopRadio() {
    this.radio.stop();
    this.radioPending = false;
    this.radioPaused = false;
  }
  speak(id: keyof typeof RADIO, lang: 'zh' | 'en') {
    this.stopRadio();
    const clip = this.clips.get(`radio-${id}-${lang}`);
    if (!clip || this.muted || !this.activated || this.disposed) return;
    this.radio.clip = clip;
    this.radioPending = true;
    this.radioStartWait = 0;
    this.radioLastTime = 0;
    this.radio.play();
  }
  advanceRadio(dt: number) {
    if (!this.radioPending) return;
    if (this.muted || this.disposed) { this.stopRadio(); return; }
    if (this.radioPaused) {
      this.radioPaused = false;
      this.radioStartWait = 0;
      this.radioLastTime = this.radio.currentTime;
      this.radio.play();
    }
    const time = this.radio.currentTime;
    this.radioStartWait = time > this.radioLastTime + .0001 ? 0 : this.radioStartWait + dt;
    this.radioLastTime = time;
    // A blocked/stalled audio device must not strand the mission; advancing playback waits for ENDED.
    if (this.radioStartWait >= 2) this.stopRadio();
  }
  ambience(playing: boolean) {
    this.engine.volume = this.radio.playing ? .04 : .13;
    const clip = this.clips.get('engine');
    if (clip && playing && this.activated && !this.muted) {
      if (!this.engine.playing) {
        this.engine.play();
      }
    } else if (this.engine.playing) this.engine.stop();
  }
  readCoach() {
    try {
      return sys.localStorage.getItem('night-overwatch-coach-v2') !== 'done';
    } catch {
      return true;
    }
  }
  get rewardsAvailable() {
    const bridge = (globalThis as typeof globalThis & {
      SmallGamesRewardAds?: { available?: boolean; offer?: RewardProvider };
      SmallGamesPublishingConfig?: { adsEnabled?: boolean };
    });
    if (bridge.SmallGamesPublishingConfig?.adsEnabled === false) return false;
    return Boolean(this.rewardProvider || (bridge.SmallGamesRewardAds?.available !== false && bridge.SmallGamesRewardAds?.offer) ||
      (!bridge.SmallGamesPublishingConfig && this.rewardPractice && this.developer));
  }
  async offerReward(kind: RewardKind) {
    if (!this.rewardsAvailable) return 'unavailable' as const;
    const next = nextZoomLimit(this.rewards.zoomLimit);
    if (kind === 'zoom' && !next) return 'unavailable' as const;
    const bridge = (globalThis as typeof globalThis & {
      SmallGamesRewardAds?: { offer: RewardProvider };
    }).SmallGamesRewardAds;
    const provider = this.rewardProvider ?? bridge?.offer.bind(bridge);
    if (!provider) return this.rewardPractice && this.developer ? 'mock' as const : 'unavailable' as const;
    try {
      const outcome = await provider({ id: 'night-overwatch:' + kind,
        reward: kind === 'supply' ? { supplyChoice: 1 } : { zoomLimit: next! } });
      return ['completed', 'dismissed', 'unavailable', 'failed'].includes(outcome?.status)
        ? outcome.status : 'failed' as const;
    } catch { return 'failed' as const; }
  }
  grantReward(kind: RewardKind) {
    if (kind === 'supply') this.rewards.pendingSupply = true;
    else this.rewards.zoomLimit = nextZoomLimit(this.rewards.zoomLimit) ?? this.rewards.zoomLimit;
    this.saveRewards();
  }
  claimSupply(reward: SupplyReward) {
    if (!this.rewards.pendingSupply || !['tracking', 'ammo', 'rate', 'restock'].includes(reward)) return false;
    this.rewards.pendingSupply = false;
    if (reward === 'ammo') this.rewards.ammo = Math.min(Number.MAX_SAFE_INTEGER, this.rewards.ammo + 2);
    this.saveRewards();
    return true;
  }
  saveRewards() {
    try { sys.localStorage.setItem(this.rewardStorageKey, JSON.stringify(this.rewards)); }
    catch { /* The current session remains playable without storage. */ }
  }
  cancelReward() {
    (globalThis as typeof globalThis & { SmallGamesRewardAds?: { cancel(): void } }).SmallGamesRewardAds?.cancel();
  }
  saveCoach() {
    try {
      sys.localStorage.setItem('night-overwatch-coach-v2', 'done');
    } catch {
      /* Optional preference; storage denial never blocks play. */
    }
  }
  get developer() {
    if (!sys.isBrowser) return false;
    try { return !!(globalThis as typeof globalThis & { SmallGamesDev?: { isEnabled(): boolean } }).SmallGamesDev?.isEnabled(); }
    catch { return false; }
  }
  readOperationProgress() {
    try { this.missions = readMissionProgress(sys.localStorage.getItem('night-overwatch-progress-v1')); }
    catch { /* Retain current-session progress if optional storage is denied. */ }
    return this.missions;
  }
  saveOperationProgress(progress: MissionProgress) {
    this.missions = progress;
    try { sys.localStorage.setItem('night-overwatch-progress-v1', JSON.stringify(progress)); }
    catch { /* All remaining operations can still unlock in the current session. */ }
  }
  saveTimes() {
    try { sys.localStorage.setItem('night-overwatch-times-v1', JSON.stringify(this.times)); }
    catch { /* Keep this session's personal best when optional storage is denied. */ }
  }
  readMission(): MissionId {
    try {
      const mission = missionDefinition(sys.localStorage.getItem('night-overwatch-mission-v1'));
      return mission.mode === 'escort' ? mission.id : 'corridor-01';
    }
    catch { return 'corridor-01'; }
  }
  saveMission(id: MissionId) {
    if (missionDefinition(id).mode !== 'escort') return;
    try { sys.localStorage.setItem('night-overwatch-mission-v1', id); }
    catch { /* Choosing a mission works even when storage is denied. */ }
  }
  readWarmupRecord(): TrainingRecord | undefined {
    try { return parseTrainingRecord(sys.localStorage.getItem('night-overwatch-training-v1')); }
    catch { return; }
  }
  saveWarmupRecord(record: TrainingRecord) {
    try { sys.localStorage.setItem('night-overwatch-training-v1', JSON.stringify(record)); }
    catch { /* A denied optional record never blocks another attempt. */ }
  }
  dispose() {
    this.disposed = true;
    for (const fn of this.cleanup) fn();
    this.stop();
  }
}
