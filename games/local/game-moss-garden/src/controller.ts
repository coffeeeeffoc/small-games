import type { CanvasGameTarget, CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import type { GameHost, JsonValue } from '@coffeeeeffoc/game-contract';
import { CHAPTERS, LEVELS } from './content.ts';
import {
  createPuzzle,
  placeSeed,
  toggleExclusion,
  undo,
  hint,
  restorePuzzle,
  solve,
} from './rules.ts';
import { createSave, parseSave, unlocked, recordCompletion } from './progress.ts';
import { renderGame, type View, type HitArea } from './render.ts';

export type MossTarget = CanvasGameTarget & {
  native?: boolean;
  challengeLevel?: string;
  challengeGoal?: { hints: number; mistakes: number; elapsedMs: number };
  minimumTouchSize?(): number;
  naturalBreak?(): Promise<void>;
  shareChallenge?(result: {
    levelId: string;
    levelNumber: number;
    elapsedMs: number;
    hints: number;
    mistakes: number;
  }): Promise<string>;
  dev?: boolean;
  onView?(view: View, hits: HitArea[]): void;
  onAction?(listener: (id: string) => void): () => void;
  fullscreen?(): Promise<void>;
  feedback?(kind: 'place' | 'mark' | 'win', sound: boolean, vibration: boolean): void;
};

/** The same controller and renderer run in browser and platform Canvas runtimes. */
export async function createMossGame(target: MossTarget, host: GameHost) {
  const context = target.canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  let save = createSave();
  try {
    const record = await host.storage.read('progress');
    if (record) save = parseSave(record.value);
  } catch {
    // Local play is available when optional storage is blocked or offline.
  }
  let level = LEVELS.find((item) => item.id === save.active?.levelId) ?? LEVELS[0];
  let puzzle = save.active ? restorePuzzle(level, save.active.puzzle) : createPuzzle(level);
  let elapsedMs = save.active?.elapsedMs ?? 0;
  let page: View['page'] = 'home';
  let levelChapter = 1;
  let returnPage: View['page'] = 'home';
  let mode: 'seed' | 'mark' = 'seed';
  let suspended = false;
  let disposed = false;
  let practice = false;
  let challenge = false;
  let publicationBusy = false;
  let invitation = LEVELS.find((item) => item.id === target.challengeLevel);
  let notice = '';
  let hits: HitArea[] = [];
  let lastTime = Date.now();
  let pendingWrite = Promise.resolve();
  let pointer: {
    id: number;
    start: HitArea;
    x: number;
    y: number;
    moved: boolean;
    cells: Set<number>;
  } | null = null;
  const callbacks: Array<() => void> = [];

  function checkpoint() {
    if (!practice && !challenge && !puzzle.completed && (page === 'play' || page === 'pause')) {
      save = { ...save, active: { levelId: level.id, puzzle, elapsedMs } };
    }
    const snapshot = JSON.parse(JSON.stringify(save)) as JsonValue;
    pendingWrite = pendingWrite
      .then(async () => {
        await host.storage.write('progress', snapshot);
      })
      .catch(() => {
        notice = '暂时无法保存，仍可继续游玩';
      });
  }
  function tick() {
    const now = Date.now();
    if (page === 'play' && !suspended && !disposed)
      elapsedMs += Math.min(1500, Math.max(0, now - lastTime));
    lastTime = now;
  }
  function continueLevel() {
    return (
      LEVELS.find((item) => item.id === save.active?.levelId) ??
      LEVELS.find((item) => unlocked(save, item) && !save.completed[item.id]) ??
      LEVELS[0]
    );
  }
  function openLevels() {
    checkpoint();
    levelChapter = continueLevel().chapter;
    invitation = undefined;
    practice = false;
    challenge = false;
    notice = '';
    page = 'levels';
  }
  function draw() {
    if (disposed) return;
    const view: View = {
      width: target.canvas.width,
      height: target.canvas.height,
      page,
      level,
      levels: LEVELS,
      puzzle,
      completed: save.completed,
      unlocked: Math.max(
        1,
        ...LEVELS.filter((item) => unlocked(save, item)).map((item) => item.number),
      ),
      elapsedMs,
      mode,
      sound: save.sound,
      vibration: save.vibration,
      hasActive: !!save.active,
      activeLevelId: save.active?.levelId,
      continueLevel: continueLevel(),
      levelChapter,
      dev: !!target.dev,
      native: !!target.native,
      notice:
        notice ||
        (practice ? '开发试玩 · 不计入进度' : challenge ? '好友同关挑战 · 不影响闯关进度' : ''),
      challenge,
      challengeGoal: target.challengeGoal,
      invitationNumber: invitation?.number,
      canShare: typeof target.shareChallenge === 'function',
      minimumTouchSize: target.minimumTouchSize?.(),
    };
    hits = renderGame(context!, view);
    target.onView?.(view, hits);
  }
  function start(selected: typeof level, resume = false, developer = false, shared = false) {
    level = selected;
    practice = developer;
    challenge = shared;
    if (resume && save.active?.levelId === level.id) {
      puzzle = restorePuzzle(level, save.active.puzzle);
      elapsedMs = save.active.elapsedMs;
    } else {
      puzzle = createPuzzle(level);
      elapsedMs = 0;
    }
    page = 'play';
    mode = 'seed';
    lastTime = Date.now();
    notice = '';
    checkpoint();
  }
  function afterMove(previous: typeof puzzle, kind: 'place' | 'mark') {
    if (
      puzzle.placed.join(',') !== previous.placed.join(',') ||
      puzzle.excluded.join(',') !== previous.excluded.join(',')
    )
      target.feedback?.(kind, save.sound, save.vibration);
    if (puzzle.completed) {
      if (!practice && !challenge) {
        save = recordCompletion(save, level, puzzle, elapsedMs);
        save = { ...save, active: null };
      }
      page = 'result';
      target.feedback?.('win', save.sound, save.vibration);
    }
    checkpoint();
  }
  function act(id: string, afterBreak = false) {
    if (disposed || suspended || publicationBusy) return;
    if (
      page === 'result' &&
      ['result:next', 'result:replay', 'result:home', 'result:levels'].includes(id) &&
      target.naturalBreak &&
      !afterBreak &&
      !practice
    ) {
      publicationBusy = true;
      void target
        .naturalBreak()
        .catch(() => {})
        .finally(() => {
          publicationBusy = false;
          if (!disposed && page === 'result') act(id, true);
        });
      return;
    }
    if (id === 'result:share' && page === 'result' && target.shareChallenge) {
      const sharedPuzzle = puzzle;
      void target
        .shareChallenge({
          levelId: level.id,
          levelNumber: level.number,
          elapsedMs,
          hints: puzzle.hints,
          mistakes: puzzle.mistakes,
        })
        .then((message) => {
          if (!disposed && page === 'result' && puzzle === sharedPuzzle) {
            notice = message;
            draw();
          }
        })
        .catch(() => {
          if (!disposed) {
            notice = '分享暂不可用，仍可继续播种';
            draw();
          }
        });
      return;
    }
    tick();
    pointer = null;
    if (id.startsWith('cell:') && page === 'play') {
      const index = Number(id.slice(5)),
        previous = puzzle;
      puzzle =
        mode === 'mark' ? toggleExclusion(level, puzzle, index) : placeSeed(level, puzzle, index);
      afterMove(previous, mode === 'mark' ? 'mark' : 'place');
    } else if (id.startsWith('level:') && page === 'levels') {
      const selected = LEVELS.find((item) => item.id === id.slice(6));
      if (selected && unlocked(save, selected)) {
        invitation = undefined;
        start(selected, save.active?.levelId === selected.id);
      }
    } else if (id === 'home:start' && invitation) {
      const selected = invitation;
      invitation = undefined;
      start(selected, false, false, true);
    } else if (id === 'home:start' || (id === 'levels:continue' && page === 'levels')) {
      invitation = undefined;
      start(continueLevel(), !!save.active);
    } else if (
      (id === 'home:levels' && page === 'home') ||
      (id === 'pause:levels' && page === 'pause') ||
      (id === 'result:levels' && page === 'result')
    ) {
      openLevels();
    } else if ((id === 'levels:prev' || id === 'levels:next') && page === 'levels') {
      const index = CHAPTERS.findIndex((chapter) => chapter.id === levelChapter);
      const chapter = CHAPTERS[index + (id === 'levels:next' ? 1 : -1)];
      if (chapter) levelChapter = chapter.id;
    } else if (id === 'home:settings') page = 'settings';
    else if (id === 'home:help' || id === 'play:help') {
      returnPage = page;
      if (page === 'play') checkpoint();
      page = 'help';
    } else if (id === 'nav:back') {
      checkpoint();
      page = page === 'help' ? returnPage : 'home';
    } else if (id === 'play:pause') {
      page = 'pause';
      checkpoint();
    } else if (id === 'pause:resume') {
      page = 'play';
      lastTime = Date.now();
    } else if (id === 'pause:restart' || id === 'result:replay')
      start(level, false, practice, challenge);
    else if (id === 'pause:home') {
      checkpoint();
      page = 'home';
    } else if (id === 'result:home') page = 'home';
    else if (id === 'result:next' && challenge) start(level, false, false, true);
    else if (id === 'result:next') {
      const next = LEVELS[LEVELS.indexOf(level) + 1];
      if (next && (practice || unlocked(save, next))) start(next, false, practice);
      else openLevels();
    } else if (id === 'play:seed') mode = 'seed';
    else if (id === 'play:mark') mode = 'mark';
    else if (id === 'play:undo' && page === 'play') {
      puzzle = undo(level, puzzle);
      checkpoint();
    } else if (id === 'play:hint' && page === 'play') {
      const previous = puzzle;
      puzzle = hint(level, puzzle);
      afterMove(previous, 'place');
    } else if (id === 'settings:sound') {
      save = { ...save, sound: !save.sound };
      checkpoint();
    } else if (id === 'settings:vibration') {
      save = { ...save, vibration: !save.vibration };
      checkpoint();
    } else if (id === 'settings:fullscreen' && !target.native) {
      void target.fullscreen?.().catch(() => {
        notice = '当前环境不支持全屏，可继续游玩';
        draw();
      });
    } else if (id === 'dev:solve' && target.dev && page === 'play') {
      practice = true;
      const answer = solve(level, 1)[0];
      if (answer) {
        puzzle = { ...puzzle, placed: answer, completed: true };
        page = 'result';
      }
    } else if (id === 'dev:next' && target.dev) {
      start(LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length], false, true);
    }
    draw();
  }
  const find = (x: number, y: number) =>
    hits.find((hit) => x >= hit.x && y >= hit.y && x < hit.x + hit.width && y < hit.y + hit.height);
  function handlePointer(event: CanvasPointerEvent) {
    if (disposed || suspended || publicationBusy) return;
    if (event.phase === 'down') {
      if (pointer) return;
      const hit = find(event.x, event.y);
      if (hit)
        pointer = {
          id: event.pointerId,
          start: hit,
          x: event.x,
          y: event.y,
          moved: false,
          cells: new Set(hit.id.startsWith('cell:') ? [Number(hit.id.slice(5))] : []),
        };
    } else if (pointer?.id === event.pointerId) {
      if (event.phase === 'cancel') {
        pointer = null;
        return;
      }
      const active = pointer;
      if (Math.hypot(event.x - active.x, event.y - active.y) > 12) active.moved = true;
      const hit = find(event.x, event.y);
      if (mode === 'mark' && hit?.id.startsWith('cell:')) active.cells.add(Number(hit.id.slice(5)));
      if (event.phase === 'up') {
        pointer = null;
        if (
          mode === 'mark' &&
          page === 'play' &&
          active.start.id.startsWith('cell:') &&
          hit?.id.startsWith('cell:')
        ) {
          tick();
          const previous = puzzle;
          for (const index of active.cells)
            if (!puzzle.placed.includes(index) && !puzzle.excluded.includes(index))
              puzzle = toggleExclusion(level, puzzle, index);
          if (
            active.cells.size === 1 &&
            previous.excluded.includes(Number(active.start.id.slice(5)))
          )
            puzzle = toggleExclusion(level, puzzle, Number(active.start.id.slice(5)));
          afterMove(previous, 'mark');
          draw();
        } else if (!active.moved && hit?.id === active.start.id) act(hit.id);
      }
    }
  }
  if (target.onPointer) callbacks.push(target.onPointer(handlePointer));
  else
    callbacks.push(
      target.onTap((x, y) => {
        const hit = find(x, y);
        if (hit) act(hit.id);
      }),
    );
  if (target.onAction) callbacks.push(target.onAction(act));
  const interval = setInterval(() => {
    tick();
    if (page === 'play' && !suspended) draw();
  }, 1000);
  draw();
  return {
    act,
    redraw: draw,
    isSuspended: () => suspended,
    snapshot: () => ({ page, levelId: level.id, puzzle, elapsedMs, practice, challenge }),
    pause() {
      tick();
      suspended = true;
      pointer = null;
      checkpoint();
    },
    resume() {
      suspended = false;
      lastTime = Date.now();
      draw();
    },
    async dispose() {
      if (disposed) return;
      tick();
      checkpoint();
      disposed = true;
      pointer = null;
      clearInterval(interval);
      callbacks.forEach((stop) => stop());
      await pendingWrite;
    },
  };
}
