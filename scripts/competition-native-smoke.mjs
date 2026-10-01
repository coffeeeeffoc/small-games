import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { competitionGames, competitionPlatforms } from '../scripts/competition-build.mjs';
import cops from '../services/runtime-api/rules/cops.mjs';
import realtime from '../services/runtime-api/rules/realtime.mjs';
import letters from '../services/runtime-api/rules/letters.mjs';
import history from '../services/runtime-api/rules/history.mjs';
import chess from '../services/runtime-api/rules/chess.mjs';
import { findSpelling } from '../games/local/letters-words2/engine.js';

const rules = new Map([cops, realtime, letters, history, chess].map((rule) => [rule.id, rule]));
const root = fileURLToPath(new URL('../apps/shell-minigame/dist/', import.meta.url));
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

// Execute the actual reviewed bundles without document/window/fetch, against the real game rules.
// This SDK fixture verifies contracts and build isolation, not official SDK/device compatibility.
for (const [game, selected] of Object.entries(competitionGames)) {
  for (const [platform, adapter] of Object.entries(competitionPlatforms)) {
    for (const audioMode of ['normal', 'create-failure', 'initialize-failure', 'play-failure']) {
      const directory = path.join(root, platform, game);
      const source = readFileSync(path.join(directory, 'game.js'), 'utf8');
      const release = JSON.parse(readFileSync(path.join(directory, 'release.json'), 'utf8'));
      assert.equal(release.platform, platform);
      assert.equal(release.game, game);
      assert.equal(release.gameplayScope, 'server-authoritative friend competition only');
      assert.equal(release.nativeRuntimeVerified, false);
      assert.doesNotMatch(source, /document\.|window\.|createElement\(|iframe|XMLHttpRequest/);
      const listeners = new Map();
      const records = new Map();
      const requests = [];
      const intervals = new Set();
      const labels = [];
      const paths = [];
      let transform = { x: 0, y: 0, sx: 1, sy: 1 };
      const stack = [];
      const context2d = new Proxy(
        {
          setTransform(a, _b, _c, d, x, y) {
            transform = { x: x / a, y: y / d, sx: 1, sy: 1 };
          },
          fillRect(_x, y) {
            if (y === 0 && stack.length === 0) {
              labels.length = 0;
              paths.length = 0;
            }
          },
          fillText(text, x, y) {
            labels.push({
              text: String(text),
              x: transform.x + x * transform.sx,
              y: transform.y + y * transform.sy,
            });
          },
          measureText(text) {
            return { width: String(text).length * 8 };
          },
          save() {
            stack.push({ ...transform });
          },
          restore() {
            transform = stack.pop() || transform;
          },
          translate(x, y) {
            transform.x += x * transform.sx;
            transform.y += y * transform.sy;
          },
          scale(x, y) {
            transform.sx *= x;
            transform.sy *= y;
          },
          moveTo(x, y) {
            this.lastPoint = {
              x: transform.x + x * transform.sx,
              y: transform.y + y * transform.sy,
            };
          },
          lineTo(x, y) {
            const next = { x: transform.x + x * transform.sx, y: transform.y + y * transform.sy };
            if (this.lastPoint) paths.push([this.lastPoint, next]);
            this.lastPoint = next;
          },
          createLinearGradient() {
            return { addColorStop() {} };
          },
          createRadialGradient() {
            return { addColorStop() {} };
          },
          drawImage(image) {
            assert.ok(image.width > 0);
          },
        },
        {
          get(target, key) {
            return key in target ? target[key] : () => {};
          },
        },
      );
      let dimensions = { windowWidth: 390, windowHeight: 844, pixelRatio: 2 };
      const canvas = { width: 0, height: 0, getContext: () => context2d };
      const audio = {
        src: '',
        volume: 1,
        playing: false,
        destroyed: false,
        play() {
          if (audioMode === 'play-failure') throw new Error('audio unavailable');
          assert.ok(existsSync(path.join(directory, this.src)));
          this.playing = true;
        },
        stop() {
          this.playing = false;
        },
        destroy() {
          this.destroyed = true;
          this.playing = false;
        },
        onError(fn) {
          this.listener = fn;
        },
        offError(fn) {
          if (this.listener === fn) this.listener = null;
        },
      };
      if (audioMode === 'initialize-failure')
        Object.defineProperty(audio, 'src', {
          set() {
            throw new Error('audio source unavailable');
          },
        });
      const rule = rules.get(game);
      let state = rule.initial(0),
        seq = 0,
        saves = 0,
        storageFails = false;
      const room = () => ({
        code: 'ABCDEFABCDEF',
        game,
        version: rule.version,
        status: 'playing',
        seq,
        roles: rule.roles,
        mode: rule.modes?.[0].id,
        pollMs: 1200,
        players: [
          { id: 'a', role: 'pursuer', ready: true },
          { id: 'b', role: 'runner', ready: true },
        ],
        you: 0,
        state: rule.view(state, 0),
        serverNow: 1000,
        deadline: 1000 + rule.durationMs,
      });
      const sdk = {
        createCanvas: () => canvas,
        getSystemInfoSync: () => dimensions,
        createImage() {
          const image = { width: 1024, height: 512, onload: null, onerror: null };
          Object.defineProperty(image, 'src', {
            set(src) {
              assert.ok(existsSync(path.join(directory, src)), `missing native scene ${src}`);
              queueMicrotask(() => image.onload?.());
            },
          });
          return image;
        },
        createInnerAudioContext() {
          if (audioMode === 'create-failure') throw new Error('audio unavailable');
          return audio;
        },
        getStorageSync: (key) =>
          key.startsWith('competition-session-v1:')
            ? JSON.stringify({ token: 'a'.repeat(64), expiresAt: Date.now() + 3600000 })
            : records.get(key),
        setStorageSync(key, value) {
          if (storageFails) throw new Error('disk unavailable');
          records.set(key, value);
          saves++;
        },
        removeStorageSync: (key) => records.delete(key),
        request({ url, data, success }) {
          requests.push({ url, data });
          const route = new URL(url, 'https://fixture.invalid').pathname;
          let result;
          if (route.endsWith('/me')) result = { playerId: 'a', name: '测试玩家' };
          else if (route.includes('/boards/'))
            result = {
              version: rule.version,
              roles: rule.roles,
              modes: rule.modes || [],
              top: [],
              eligiblePlayers: 0,
            };
          else if (route.endsWith('/actions')) {
            state = rule.action(state, data.action, 0, 0) || state;
            seq++;
            result = room();
          } else result = room();
          success({ statusCode: 200, data: result });
        },
        showShareMenu() {},
        shareAppMessage() {},
        showKeyboard() {},
        hideKeyboard() {},
        getLaunchOptionsSync() {
          if (audioMode === 'create-failure') throw new Error('launch metadata unavailable');
          return undefined;
        },
      };
      for (const name of [
        'TouchEnd',
        'Hide',
        'Show',
        'KeyboardConfirm',
        'WindowResize',
        'AudioInterruptionBegin',
        'ShareAppMessage',
      ]) {
        const set = new Set();
        listeners.set(name, set);
        sdk[`on${name}`] = (fn) => set.add(fn);
        sdk[`off${name}`] = (fn) => set.delete(fn);
      }
      const context = vm.createContext({
        [adapter.sdk]: sdk,
        console,
        setTimeout,
        clearTimeout,
        queueMicrotask,
        setInterval(fn) {
          intervals.add(fn);
          return fn;
        },
        clearInterval(fn) {
          intervals.delete(fn);
        },
      });
      const module = { exports: {} };
      vm.runInContext(`(function(module,exports){${source}\n})`, context)(module, module.exports);
      await flush();
      assert.equal(stack.length, 0, 'renderer balances Canvas save/restore');
      assert.ok(
        labels.some(({ text }) => text === selected.title),
        `${platform}/${game} must render title`,
      );
      assert.deepEqual([canvas.width, canvas.height], [780, 1688]);
      const emit = (name, event) => {
        for (const fn of listeners.get(name)) fn(event);
      };
      const tap = (label) => {
        const hit =
          labels.find(({ text }) => text === label) ||
          labels.find(({ text }) => text.includes(label));
        assert.ok(
          hit,
          `${platform}/${game} missing ${label}: ${labels.map((x) => x.text).join('|')}`,
        );
        emit('TouchEnd', { changedTouches: [{ clientX: hit.x + 1, clientY: hit.y - 1 }] });
      };
      tap('创建好友挑战');
      await flush();
      const touchPoint = (x, y) =>
        emit('TouchEnd', { changedTouches: [{ clientX: x, clientY: y }] });
      if (game === 'cops-robbers') {
        const view = rule.view(state, 0),
          from = view.board.cops[0];
        const target = view.map.edges
          .flatMap(([a, b]) => (a === from ? [b] : b === from ? [a] : []))
          .find((node) => !view.board.cops.includes(node));
        assert.ok(Number.isInteger(target));
        tap(String(target + 1));
        await flush();
        assert.equal(state.board.cops[0], target, 'tapping a road node moves the selected pursuer');
      } else if (game === 'cops-robbers-realtime') {
        const segment = paths.find(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y) > 40);
        assert.ok(segment, 'street renderer must draw a road');
        touchPoint((segment[0].x + segment[1].x) / 2, (segment[0].y + segment[1].y) / 2);
        await flush();
        assert.equal(requests.at(-1).data.action.type, 'move', 'tapping a street issues a move');
      } else if (game === 'letters-words2') {
        const spelling = findSpelling(state.game, state.game.activeWordId);
        assert.ok(spelling?.length, 'fixture has an available spelling');
        for (const id of spelling) {
          const view = rule.view(state, 0),
            tile = view.tiles.find((entry) => entry.id === id);
          const scale = Math.min(370 / view.board.width, (664 - 226) / view.board.height);
          touchPoint(
            (390 - view.board.width * scale) / 2 + (tile.x + tile.size / 2) * scale,
            180 + 95 + (tile.y + tile.size / 2) * scale,
          );
          await flush();
          assert.ok(
            state.game.selected.includes(id),
            'physical tile touch selects the intended tile',
          );
        }
        tap('检查');
        await flush();
        assert.equal(
          state.correct,
          1,
          'a word submitted through Canvas input is accepted by real rules',
        );
      } else if (game === 'vibeJam-myself-history-guess') {
        tap('地图选点');
        touchPoint(195, 180 + 280);
        tap('输入猜测年代');
        for (const digit of ['2', '0', '0', '0']) tap(digit);
        tap('完成年代输入');
        tap('提交地点与年代');
        await flush();
        assert.equal(
          state.answers.length,
          1,
          'map touch and numeric input submit a historical guess',
        );
        assert.ok(
          labels.some(({ text }) => text.includes('本幕 ')),
          'the scene reveals scored feedback',
        );
      } else {
        tap('先抽子查看');
        await flush();
        assert.ok(state.pending);
        touchPoint(39, 180 + 36 + 20);
        await flush();
        assert.equal(state.board[0]?.side, 'red', 'physical board touch deploys the drawn piece');
        assert.equal(state.pending, null);
      }
      assert.ok(seq >= 1, `${platform}/${game} must send legal gameplay actions`);
      assert.equal(stack.length, 0, 'gameplay renderer balances Canvas save/restore');
      assert.equal(
        audio.playing,
        audioMode === 'normal',
        'audio faults do not block valid gameplay',
      );
      assert.equal(records.get(`${platform}:${game}:competition-room`), 'ABCDEFABCDEF');
      sdk.shareAppMessage = () => {
        throw new Error('share unavailable');
      };
      tap('邀请');
      assert.ok(
        labels
          .map(({ text }) => text)
          .join('')
          .includes('可分享或发送房间码'),
        'optional share failure preserves room-code invitation',
      );
      emit('Hide');
      assert.equal(audio.playing, false);
      const requestCount = requests.length;
      emit('TouchEnd', { changedTouches: [{ clientX: 30, clientY: 200 }] });
      for (const poll of intervals) poll();
      await flush();
      assert.equal(
        requests.length,
        requestCount,
        'background taps and polling cannot mutate gameplay',
      );
      emit('Show');
      storageFails = true;
      tap('声音：');
      assert.ok(
        labels.some(({ text }) => text.includes('声音设置本次有效')),
        'storage errors preserve usable mute controls',
      );
      storageFails = false;
      dimensions = { windowWidth: 420, windowHeight: 900, pixelRatio: 3 };
      emit('WindowResize', dimensions);
      assert.deepEqual([canvas.width, canvas.height], [1260, 2700]);
      const instance = module.exports.instance;
      assert.ok(instance, 'native bundle exports its stoppable session');
      instance.stop();
      instance.stop();
      assert.equal(
        [...listeners.values()].reduce((n, set) => n + set.size, 0),
        0,
      );
      assert.equal(intervals.size, 0);
      assert.equal(audio.destroyed, audioMode !== 'create-failure');
      const priorSaves = saves;
      emit('Show');
      emit('TouchEnd', { changedTouches: [{ clientX: 30, clientY: 200 }] });
      await flush();
      assert.equal(saves, priorSaves);
      if (audioMode === 'normal')
        console.log(
          `${platform}/${game}: built Canvas gameplay, background, storage, resize and disposal passed`,
        );
    }
  }
}
