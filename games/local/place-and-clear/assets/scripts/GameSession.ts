import { createDeveloperAPI } from './generated/developer.js';
import {
  createLevel,
  createEndless,
  place,
  placeIssuedGroup,
  undo,
  previewPlacement,
  finishEndless,
  continueLevel,
} from './generated/engine.js';
import { LEVELS, CHAPTERS, getLevel } from './generated/levels.js';
import {
  readProgress,
  saveProgress,
  recordLevelResult,
  recordEndlessResult,
  isLevelUnlocked,
  resumeState,
  saveCurrentGame,
} from './generated/progress.js';
import { createOnlineClient } from './generated/client.js';
import { canResetOptions, resetOptions, createRewardGate } from './generated/rewards.js';
export const platform = globalThis as typeof globalThis & {
  SmallGamesDev?: any;
  ThreeChooseTwoDev?: any;
  ThreeChooseTwoHost?: any;
  SmallGamesRewardAds?: any;
  ThreeChooseTwoPublishing?: any;
  getThreeChooseTwoSnapshot?: () => any;
  ThreeChooseTwoLoading?: any;
};
export function createSession(options: {
  storage: Storage;
  audio: any;
  changed(): void;
  hidden(): boolean;
  port(): any;
  inspect(): any;
}) {
  const storage = options.storage,
    audio = options.audio,
    online = createOnlineClient();
  let progress = readProgress(storage),
    state: any = null;
  let screen = 'home',
    previousScreen = 'home',
    briefLevel = 1,
    briefPractice = false,
    levelPage = 0;
  let selectedSlot: number | null = null,
    inputLockedUntil = 0,
    animationTimer: any,
    toastTimer: any;
  let onlineSession: any = null,
    onlineBusy = false,
    onlineError = '',
    pendingAction: any = null,
    pendingFinish = false;
  let ranking: any = null,
    rankingBusy = false,
    rankingError = '';
  let devPractice = false,
    recordedResult: any = null,
    developerReturnScreen = 'home',
    devShowSolution = false;
  let rewardEpoch = 0,
    settledState: any = null;
  let gameEpoch = 0,
    lifecycleEpoch = 0,
    publishingBusy = false,
    modal = '',
    message = '',
    disposed = false;
  const unregister: (() => void)[] = [];
  const devEnabled = () => platform.SmallGamesDev?.isEnabled() === true;
  const fmt = (value: any) => Number(value || 0).toLocaleString('zh-CN');
  const endlessName = (game = state) => (game?.variant === 'refill' ? '立即补位' : '三选二');
  const localBest = (game = state) =>
    game?.variant === 'refill' ? progress.refillBest : progress.practiceBest;
  const query = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
  const invitedSeed =
    /^\d{1,10}$/.test(query?.get('seed') || '') && Number(query?.get('seed')) <= 0xffffffff
      ? Number(query!.get('seed'))
      : null;
  const invitedTarget =
    /^\d{1,10}$/.test(query?.get('targetScore') || '') &&
    Number(query?.get('targetScore')) <= 1_000_000_000
      ? Number(query!.get('targetScore'))
      : null;
  const invitedVariant = query?.get('variant') === 'refill' ? 'refill' : 'classic';
  const publishing = {
    share: (args: any) =>
      platform.ThreeChooseTwoPublishing?.share(args) ||
      Promise.resolve({ status: 'unavailable' }),
  };
  function render() {
    if (!disposed) options.changed();
  }
  function cancelDrag() {
    selectedSlot = null;
  }
  function toast(value: string) {
    message = value;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      message = '';
      render();
    }, 2800);
    render();
  }
  function show(next: string) {
    cancelDrag();
    if (next === 'levels' && screen !== 'levels')
      levelPage = Math.floor((Math.min(progress.unlocked, LEVELS.length) - 1) / 30);
    if (next !== screen && (modal || rewards.pending)) {
      cancelRewards();
      modal = '';
    }
    previousScreen = screen;
    screen = next;
    audio.syncMusic(next === 'playing' && !modal);
    render();
  }
  const rewards = createRewardGate({
    getState: () => state,
    eligible: (kind: string) =>
      kind === 'reset'
        ? canResetOptions(state, !!onlineSession)
        : !devPractice &&
          !onlineSession &&
          state?.mode === 'level' &&
          state.status === 'lost' &&
          state.reason === 'groups-exhausted' &&
          !state.continued,
    getPort: options.port,
    changed: render,
    grant: (kind: string, id: string) => {
      const next = kind === 'reset' ? resetOptions(state, id) : continueLevel(state, id);
      if (next !== state) {
        if (!devPractice)
          try {
            storage.setItem(
              'three-choose-two-pending-reward-v1',
              JSON.stringify({ state, rewardId: id, kind }),
            );
          } catch {}
        state = next;
        const saved = persist();
        if (saved && !devPractice)
          try {
            storage.setItem('three-choose-two-pending-reward-v1', 'null');
          } catch {}
        audio.play('clear');
      }
    },
  });
  function cancelRewards() {
    rewardEpoch++;
    rewards.cancel();
  }
  async function reward(kind: string) {
    const original = state,
      epoch = gameEpoch,
      request = ++rewardEpoch;
    const result = await rewards.request(kind);
    if (
      request !== rewardEpoch ||
      disposed ||
      (state !== original && result.status !== 'completed') ||
      epoch !== gameEpoch
    )
      return;
    modal = '';
    inputLockedUntil = 0;
    audio.syncMusic(screen === 'playing');
    if (result.status === 'completed') {
      if (kind === 'continue') show('playing');
      toast(kind === 'reset' ? '尚未放置的积木已更换' : '已增加 2 组积木');
    } else
      toast(
        result.status === 'unavailable'
          ? '广告暂不可用，请稍后再试。'
          : result.status === 'dismissed'
            ? '未完成观看，选项保持不变。'
            : '广告加载失败，选项保持不变。',
      );
    render();
  }
  function doPlace(slot: number, x: number, y: number) {
    if (
      screen !== 'playing' ||
      modal ||
      rewards.pending ||
      isLocked() ||
      state?.status !== 'playing'
    )
      return;
    if (!previewPlacement(state, slot, x, y).valid) {
      audio.play('invalid');
      audio.vibrate('invalid');
      toast('这里放不下，换个位置试试。');
      return;
    }
    inputLockedUntil = Date.now() + 270;
    if (onlineSession) {
      const queued = pendingAction || [];
      queued.push({
        seq: onlineSession.seq + queued.length + 1,
        group: state.group,
        slot,
        x,
        y,
      });
      pendingAction = queued;
      state = optimisticPlace(state, slot, x, y);
      saveOnline();
      void flushOnline();
    } else {
      state = place(state, slot, x, y);
      persist();
      if (state.status !== 'playing') finishLocal(false);
    }
    selectedSlot = null;
    audio.play(state.lastEvent?.lines ? 'clear' : 'place', state.lastEvent?.lines);
    audio.vibrate(state.lastEvent?.lines ? 'clear' : 'place');
    render();
    clearTimeout(animationTimer);
    const placed = state,
      epoch = gameEpoch;
    animationTimer = setTimeout(() => {
      if (disposed || state !== placed || epoch !== gameEpoch) return;
      inputLockedUntil = 0;
      if (state.status !== 'playing' && !onlineSession) finishLocal();
      else if (state.status !== 'playing' && screen === 'playing') show('result');
      else render();
    }, 280);
  }
  function persist() {
    if (
      state &&
      !state.challenge &&
      !onlineSession &&
      !devPractice &&
      (state.status === 'playing' || (state.mode === 'level' && state.status === 'lost'))
    )
      progress = saveCurrentGame(progress, state);
    return saveProgress(storage, progress);
  }

  function saveOnline() {
    try {
      storage.setItem(
        'three-choose-two-online-v1',
        JSON.stringify(
          onlineSession && onlineSession.status !== 'finished'
            ? {
                id: onlineSession.id,
                seq: onlineSession.seq,
                pending: pendingAction || [],
                finish: pendingFinish,
              }
            : null,
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  function currentLevel() {
    return state?.config || getLevel(state?.levelId || briefLevel);
  }

  function playableResume() {
    try {
      return resumeState(progress);
    } catch {
      return null;
    }
  }

  function onlineRecovery() {
    try {
      const value = JSON.parse(storage.getItem('three-choose-two-online-v1') || 'null');
      return typeof value?.id === 'string' && value.id ? value : null;
    } catch {
      return null;
    }
  }

  function canResumeOnline() {
    return onlineSession
      ? onlineSession.status !== 'finished' && !pendingFinish && state?.status === 'playing'
      : !!onlineRecovery() && !onlineRecovery().finish;
  }

  function isolateTrial() {
    if (devPractice) return;
    persist();
    if (onlineSession) saveOnline();
    cancelRewards();
    gameEpoch++;
    clearTimeout(animationTimer);
    cancelDrag();
    selectedSlot = null;
    inputLockedUntil = 0;
    onlineSession = null;
    pendingAction = null;
    pendingFinish = false;
    onlineError = '';
    devPractice = true;
  }

  function startTrial(id) {
    if (!devEnabled() || !getLevel(id)) throw new RangeError('请选择有效试玩关卡');
    isolateTrial();
    devPractice = true;
    beginLevel(id);
  }

  function exitLocalGame() {
    if (!state || onlineSession) return;
    cancelRewards();
    gameEpoch++;
    clearTimeout(animationTimer);
    cancelDrag();
    if (!devPractice && !state.challenge) {
      progress = { ...progress, currentGame: null };
      saveProgress(storage, progress);
    }
    state = null;
    devPractice = false;
    selectedSlot = null;
    inputLockedUntil = 0;
    recordedResult = null;
    show('home');
  }

  function isLocked() {
    return Date.now() < inputLockedUntil || !!state?.waitingNextGroup || !!pendingFinish;
  }

  function optimisticPlace(previous, slot, x, y) {
    return placeIssuedGroup(previous, slot, x, y);
  }

  async function flushOnline() {
    if (onlineBusy || !onlineSession) return;
    const activeSessionId = onlineSession.id;
    onlineBusy = true;
    onlineError = '';
    try {
      while (pendingAction?.length) {
        const action = pendingAction[0];
        const response = await online.place(
          { ...onlineSession, seq: action.seq - 1, state: { group: action.group } },
          action.slot,
          action.x,
          action.y,
        );
        if (disposed || onlineSession?.id !== activeSessionId) return;
        onlineSession = response;
        pendingAction.shift();
        if (!pendingAction.length) {
          pendingAction = null;
          state = response.state;
        }
        saveOnline();
      }
      if (pendingFinish || onlineSession.status === 'finished' || state.status !== 'playing') {
        if (onlineSession.status !== 'finished') {
          const response = await online.finish(onlineSession);
          if (disposed || onlineSession?.id !== activeSessionId) return;
          onlineSession = response;
        }
        state = onlineSession.state;
        pendingFinish = false;
        saveOnline();
        if (screen === 'playing' || screen === 'result') show('result');
      }
    } catch (error) {
      if (disposed || onlineSession?.id !== activeSessionId) return;
      onlineError = (error as Error).message || '网络暂时不可用。请重新连接。';
      if (
        ['ILLEGAL_ACTION', 'SEQUENCE_CONFLICT', 'ACTION_CONFLICT', 'GROUP_CONFLICT'].includes(
          (error as any).code,
        )
      ) {
        try {
          const response = await online.restore(activeSessionId);
          if (disposed || onlineSession?.id !== activeSessionId) return;
          onlineSession = response;
          pendingAction = null;
          state = onlineSession.state;
          saveOnline();
          onlineError = '局面已从服务端恢复，请继续。';
        } catch {
          /* Keep the ordered pending action for retry. */
        }
      }
    } finally {
      onlineBusy = false;
      if (screen === 'playing' || screen === 'result') render();
    }
  }

  function finishLocal(display = true) {
    if (!state || state.status === 'playing') return;
    if (!devPractice && !state.challenge) {
      if (state.mode === 'level' && state.status === 'won')
        progress = recordLevelResult(progress, state);
      else if (state.mode === 'endless') {
        const isPersonalBest = state.score > localBest();
        progress = recordEndlessResult(progress, state);
        recordedResult = { isPersonalBest };
      }
      progress =
        state.mode === 'level' && state.status === 'lost'
          ? saveCurrentGame(progress, state)
          : { ...progress, currentGame: null };
      saveProgress(storage, progress);
    }
    audio.play(state.status === 'won' ? 'win' : 'tap');
    if (screen === 'playing' || screen === 'pause') show('result');
  }

  function beginLevel(id) {
    if (onlineSession) saveOnline();
    clearTimeout(animationTimer);
    cancelRewards();
    gameEpoch++;
    onlineSession = null;
    pendingAction = null;
    pendingFinish = false;
    onlineError = '';
    state = createLevel(id);
    selectedSlot = null;
    recordedResult = null;
    inputLockedUntil = 0;
    persist();
    show('playing');
  }

  function beginPractice(
    variant = 'classic',
    seed = null,
    challenge = false,
    targetScore = null,
  ) {
    if (onlineSession) saveOnline();
    persist();
    clearTimeout(animationTimer);
    cancelRewards();
    gameEpoch++;
    onlineSession = null;
    pendingAction = null;
    pendingFinish = false;
    onlineError = '';
    devPractice = devEnabled();
    state = createEndless(seed ?? Math.floor(Math.random() * 4294967296), {
      ranked: false,
      variant,
    });
    if (challenge) {
      state.challenge = true;
      state.challengeTarget = targetScore;
    }
    selectedSlot = null;
    recordedResult = null;
    inputLockedUntil = 0;
    persist();
    show('playing');
  }

  async function beginOnline() {
    if (onlineBusy) return;
    persist();
    clearTimeout(animationTimer);
    cancelRewards();
    const epoch = ++gameEpoch;
    onlineBusy = true;
    onlineError = '';
    render();
    try {
      let saved;
      try {
        saved = JSON.parse(storage.getItem('three-choose-two-online-v1') || 'null');
      } catch {
        /* Invalid recovery is ignored. */
      }
      const response = saved?.id ? await online.restore(saved.id) : await online.create();
      if (disposed || gameEpoch !== epoch || (screen !== 'endless' && screen !== 'result'))
        return;
      onlineSession = response;
      state = onlineSession.state;
      devPractice = false;
      pendingFinish = !!saved?.finish;
      pendingAction = null;
      if (
        saved?.id === onlineSession.id &&
        onlineSession.status !== 'finished' &&
        Array.isArray(saved.pending)
      ) {
        const remaining = saved.pending.filter((action) => action.seq > onlineSession.seq);
        for (const action of remaining) {
          if (
            action.seq !== onlineSession.seq + (pendingAction?.length || 0) + 1 ||
            !previewPlacement(state, action.slot, action.x, action.y).valid ||
            action.group !== state.group
          )
            break;
          pendingAction ||= [];
          pendingAction.push(action);
          state = optimisticPlace(state, action.slot, action.x, action.y);
        }
      }
      saveOnline();
      selectedSlot = null;
      inputLockedUntil = 0;
      show(onlineSession.status === 'finished' || pendingFinish ? 'result' : 'playing');
    } catch (error) {
      if (gameEpoch === epoch)
        onlineError = (error as Error).message || '在线服务暂不可用，离线练习可以继续。';
    } finally {
      onlineBusy = false;
      render();
      if (gameEpoch === epoch && (pendingAction?.length || pendingFinish)) void flushOnline();
    }
  }

  async function openLeaderboard() {
    rankingBusy = true;
    rankingError = '';
    show('leaderboard');
    try {
      ranking = await online.board();
    } catch (error) {
      ranking = null;
      rankingError = (error as Error).message || '服务尚未连接，请稍后重试。';
    } finally {
      rankingBusy = false;
      if (screen === 'leaderboard') render();
    }
  }

  async function shareScore() {
    const rank =
      onlineSession?.settlement?.status === 'verified' ? onlineSession.settlement.rank : null;
    const text = `三块选两块：${onlineSession?.settlement?.status === 'verified' ? '在线挑战' : endlessName()} ${fmt(state.score)} 分，最高一次消除 ${state.stats.maxLines} 条线${rank ? '，全站第 ' + rank + ' 名' : ''}。${!devPractice && !state.resetRewardIds?.length && !onlineSession && Number.isInteger(state.initialSeed) ? '你能用同样的积木超越我吗？' : '这三块，你舍哪一块？'}`;
    const params =
      !devPractice &&
      !state.resetRewardIds?.length &&
      !onlineSession &&
      Number.isInteger(state.initialSeed)
        ? {
            seed: state.initialSeed,
            variant: state.variant || 'classic',
            targetScore: Math.min(1_000_000_000, state.score),
          }
        : {};
    const result = await publishing.share({ text, params });
    if (result.status === 'copied') toast('成绩与挑战链接已复制。');
    else if (['failed', 'unavailable'].includes(result.status))
      toast('分享暂不可用，可稍后重试。');
  }

  async function dispatch(action) {
    if (publishingBusy) return;
    if (rewards.pending && !['reward-cancel', 'home', 'retry'].includes(action)) return;
    if (screen === 'result' && ['again', 'retry', 'next', 'home', 'same-seed'].includes(action) && !devPractice) {
      const resultState = state, resultEpoch = lifecycleEpoch;
      publishingBusy = true;
      try {
        await platform.ThreeChooseTwoPublishing?.interstitial({ placement: 'result-exit', naturalBreak: true });
      } catch {
        // An optional advertisement cannot prevent leaving the result screen.
      } finally { publishingBusy = false; }
      if (disposed || options.hidden() || screen !== 'result' || state !== resultState || lifecycleEpoch !== resultEpoch) return;
    }
    if (action.startsWith('dev-')) {
      if (!devEnabled() || !developer) return;
      try {
        switch (action) {
          case 'dev-tools':
            persist();
            if (screen !== 'dev-tools') developerReturnScreen = screen;
            devShowSolution = false;
            show('dev-tools');
            break;
          case 'dev-back':
            show(developerReturnScreen);
            break;
          case 'dev-levels':
            persist();
            show('levels');
            break;
          case 'dev-solution':
            devShowSolution = true;
            show('dev-tools');
            break;
          case 'dev-refill-undo':
            developer.refillUndo();
            toast('试玩撤销已补充到 9 次。');
            break;
          case 'dev-restart':
            developer.restart();
            break;
          case 'dev-clear-board':
            developer.clearBoard();
            toast('试玩棋盘已清空。');
            break;
        }
      } catch (error) {
        toast((error as Error).message);
      }
      return;
    }
    switch (action) {
      case 'start': {
        if (canResumeOnline()) {
          if (onlineSession) {
            devPractice = false;
            briefPractice = false;
            selectedSlot = null;
            inputLockedUntil = 0;
            show('playing');
            if (pendingAction?.length) void flushOnline();
          } else {
            show('endless');
            await beginOnline();
          }
          break;
        }
        const saved = playableResume();
        cancelRewards();
        gameEpoch++;
        clearTimeout(animationTimer);
        devPractice = devEnabled();
        briefPractice = devEnabled();
        onlineSession = null;
        pendingAction = null;
        pendingFinish = false;
        onlineError = '';
        selectedSlot = null;
        inputLockedUntil = 0;
        if (saved) {
          state = saved;
          show(saved.status === 'playing' ? 'playing' : 'result');
        } else {
          state = null;
          briefLevel = Math.min(progress.unlocked || 1, LEVELS.length);
          show('brief');
        }
        break;
      }
      case 'begin':
        if (briefPractice && devEnabled()) startTrial(briefLevel);
        else if (isLevelUnlocked(progress, briefLevel)) {
          devPractice = devEnabled();
          beginLevel(briefLevel);
        }
        break;
      case 'levels':
        show('levels');
        break;
      case 'levels-prev':
        if (screen === 'levels' && levelPage > 0) {
          levelPage--;
          render();
        }
        break;
      case 'levels-next':
        if (screen === 'levels' && levelPage < Math.ceil(CHAPTERS.length / 3) - 1) {
          levelPage++;
          render();
        }
        break;
      case 'reset-options':
        if (canResetOptions(state, !!onlineSession)) {
          modal = 'reset';
          cancelDrag();
          audio.stop();
          render();
        }
        break;
      case 'reward-cancel':
        cancelRewards();
        modal = '';
        audio.syncMusic(screen === 'playing');
        render();
        break;
      case 'reward-confirm':
        await reward('reset');
        break;
      case 'settings':
        persist();
        show('settings');
        break;
      case 'home':
        cancelRewards();
        gameEpoch++;
        persist();
        if (onlineSession) saveOnline();
        show('home');
        break;
      case 'exit-level':
        exitLocalGame();
        break;
      case 'online-resume':
        if (onlineSession) {
          show(pendingFinish || state.status !== 'playing' ? 'result' : 'playing');
          void flushOnline();
        } else {
          show('endless');
          await beginOnline();
        }
        break;
      case 'pause':
      case 'leave-game':
        if (state) {
          persist();
          show('pause');
        }
        break;
      case 'resume':
        if (state) show(state.status === 'playing' ? 'playing' : 'result');
        break;
      case 'help':
        persist();
        show('help');
        break;
      case 'back':
        show(previousScreen === 'help' ? 'home' : previousScreen);
        break;
      case 'retry':
        if (state.mode === 'level') beginLevel(state.levelId);
        else beginPractice(state.variant);
        break;
      case 'undo':
        if (!isLocked() && state.mode === 'level') {
          const next = undo(state);
          if (next !== state) {
            state = next;
            audio.play('undo');
            persist();
            show('playing');
          }
        }
        break;
      case 'next':
        if (state.status === 'won' && state.levelId < LEVELS.length) {
          briefPractice = devPractice;
          briefLevel = state.levelId + 1;
          show('brief');
        }
        break;
      case 'endless':
        onlineError = '';
        show('endless');
        break;
      case 'practice':
        beginPractice();
        break;
      case 'challenge-invite':
        if (invitedSeed !== null)
          beginPractice(invitedVariant, invitedSeed, true, invitedTarget);
        break;
      case 'same-seed':
        if (
          !state?.resetRewardIds?.length &&
          !onlineSession &&
          Number.isInteger(state?.initialSeed)
        )
          beginPractice(
            state.variant,
            state.initialSeed,
            true,
            state.challengeTarget ?? state.score,
          );
        break;
      case 'refill':
        beginPractice('refill');
        break;
      case 'online-start':
        await beginOnline();
        break;
      case 'online-retry':
        if (onlineSession) {
          await flushOnline();
          if (screen === 'playing' || screen === 'result') render();
        } else await beginOnline();
        break;
      case 'end-run':
      case 'end':
        if (onlineSession) {
          pendingFinish = true;
          saveOnline();
          show('result');
          await flushOnline();
        } else {
          state = finishEndless(state);
          finishLocal();
          if (screen !== 'result') show('result');
        }
        break;
      case 'continue':
        await reward('continue');
        break;
      case 'again':
        if (onlineSession) {
          onlineSession = null;
          saveOnline();
          await beginOnline();
        } else beginPractice(state.variant);
        break;
      case 'leaderboard':
      case 'board-retry':
        persist();
        await openLeaderboard();
        break;
      case 'share':
        await shareScore();
        break;
    }
  }
  const developer = devEnabled()
    ? createDeveloperAPI({
        isEnabled: devEnabled,
        getSnapshot: options.inspect,
        getState: () => state,
        isolate: isolateTrial,
        beginLevel: startTrial,
        restart: () => beginLevel(state.levelId),
        update: (next: any) => {
          cancelRewards();
          clearTimeout(animationTimer);
          state = next;
          selectedSlot = null;
          inputLockedUntil = 0;
          show(
            screen === 'dev-tools'
              ? 'dev-tools'
              : state.status === 'playing'
                ? 'playing'
                : 'result',
          );
        },
        openLevels: () => {
          persist();
          show('levels');
        },
        openSolution: () => {
          persist();
          developerReturnScreen = screen;
          devShowSolution = true;
          show('dev-tools');
        },
        registerActions: (actions: any) => {
          const off = platform.SmallGamesDev.registerActions(actions);
          unregister.push(off);
          return off;
        },
      })
    : null;
  if (developer) {
    platform.ThreeChooseTwoDev = developer;
    unregister.push(
      platform.SmallGamesDev.registerActions([
        {
          id: 'three-choose-two-tools',
          label: '关卡与开发调试工具',
          run: () => dispatch('dev-tools'),
        },
      ]),
      platform.SmallGamesDev.registerSnapshot(options.inspect),
    );
  }
  // Preserve a confirmed legacy continuation receipt across migration / process restart.
  try {
    const pending = JSON.parse(storage.getItem('three-choose-two-pending-reward-v1') || 'null');
    if (pending?.state && typeof pending.rewardId === 'string' && !devEnabled()) {
      const applied =
        progress.currentGame?.continueRewardId === pending.rewardId ||
        progress.currentGame?.resetRewardIds?.includes(pending.rewardId);
      let clear =
        applied || JSON.stringify(progress.currentGame) !== JSON.stringify(pending.state);
      if (!clear) {
        const next =
          pending.kind === 'reset'
            ? resetOptions(pending.state, pending.rewardId)
            : continueLevel(pending.state, pending.rewardId);
        const candidate = saveCurrentGame(progress, next);
        if (next !== pending.state && resumeState(candidate)) {
          progress = candidate;
          clear = saveProgress(storage, progress);
        } else clear = true;
      }
      if (clear) storage.setItem('three-choose-two-pending-reward-v1', 'null');
    }
  } catch {}

  return {
    get data() {
      return {
        progress,
        state,
        screen,
        previousScreen,
        briefLevel,
        briefPractice,
        levelPage,
        selectedSlot,
        onlineSession,
        onlineBusy,
        onlineError,
        pendingAction,
        pendingFinish,
        ranking,
        rankingBusy,
        rankingError,
        devPractice,
        recordedResult,
        devShowSolution,
        developerReturnScreen,
        modal,
        message,
        rewardPending: rewards.pending,
        invitedSeed,
        invitedTarget,
        developer: devEnabled(),
        canResumeOnline: canResumeOnline(),
      };
    },
    dispatch,
    place: doPlace,
    notify: toast,
    select(slot: number) {
      if (
        !isLocked() &&
        !modal &&
        !rewards.pending &&
        state?.status === 'playing' &&
        !state.used.includes(slot)
      ) {
        selectedSlot = slot;
        render();
      }
    },
    level(id: number) {
      if (!devEnabled() && !isLevelUnlocked(progress, id)) return;
      persist();
      briefPractice = devEnabled();
      briefLevel = id;
      show('brief');
    },
    setting(key: string) {
      if (!Object.hasOwn(progress.settings, key)) return;
      progress.settings[key] = !progress.settings[key];
      persist();
      audio.play('tap');
      audio.syncMusic(screen === 'playing');
      render();
    },
    suspend() {
      lifecycleEpoch++;
      cancelDrag();
      if (!rewards.pending && screen === 'playing') {
        persist();
        show('pause');
      }
      audio.stop();
    },
    dispose() {
      persist();
      disposed = true;
      gameEpoch++;
      cancelRewards();
      onlineSession = null;
      pendingAction = null;
      pendingFinish = false;
      clearTimeout(animationTimer);
      clearTimeout(toastTimer);
      unregister.forEach((off) => off());
      if (platform.ThreeChooseTwoDev === developer) delete platform.ThreeChooseTwoDev;
    },
    cancelInput() {
      selectedSlot = null;
      render();
    },
    locked: () => isLocked() || !!modal || rewards.pending,
  };
}
