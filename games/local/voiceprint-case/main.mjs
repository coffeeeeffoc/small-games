import { createRun, judge, validateManifest } from './levels.mjs';
import { AudioPlayer } from './audio.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const letters = ['A', 'B', 'C'];
let phase = 'intro';
let manifest;
let rounds = [];
let index = 0;
let selected = null;
let sceneHeard = false;
let results = [];
let generation = 0;
let controller;
let lastPlayback = '';

const player = new AudioPlayer((label) => {
  lastPlayback = label || '';
  $('#playback-status').textContent = label ? `正在播放 · ${label}` : '声音已停止';
  $('#scene-play').setAttribute('aria-pressed', String(label === '现场录音'));
  $('#scene-play .button-label').textContent =
    label === '现场录音' ? '停止现场录音' : '播放 / 重听现场';
  $$('[data-listen]').forEach((button) => {
    const playing = label === `录音 ${letters[Number(button.dataset.listen)]}`;
    button.setAttribute('aria-pressed', String(playing));
    button.querySelector('.button-label').textContent = playing ? '停止' : '试听';
  });
  $('#stop').disabled = !label;
});

function setPhase(next) {
  phase = next;
  document.body.dataset.phase = next;
  $('#intro').hidden = next !== 'intro';
  $('#game').hidden = !['playing', 'feedback', 'loading'].includes(next);
  $('#summary').hidden = next !== 'summary';
  $('#loading').hidden = next !== 'loading';
  $('#feedback').hidden = next !== 'feedback';
  $('#home').disabled = next === 'intro';
}

function updateControls() {
  const ready = ['playing', 'feedback'].includes(phase) && $('#error').hidden;
  $('#scene-play').disabled = !ready;
  $('#confirm').disabled = !ready || phase !== 'playing' || selected === null || !sceneHeard;
  $$('[data-listen]').forEach((button) => {
    button.disabled = !ready || !sceneHeard;
  });
  $$('[data-select]').forEach((button) => {
    button.disabled = !ready || !sceneHeard || phase !== 'playing';
    const chosen = Number(button.dataset.select) === selected;
    button.setAttribute('aria-pressed', String(chosen));
    button.lastElementChild.textContent = chosen
      ? '已选中'
      : `选择 ${letters[Number(button.dataset.select)]}`;
    button.setAttribute(
      'aria-label',
      `${chosen ? '已选中' : '选择'}候选声音 ${letters[Number(button.dataset.select)]}`,
    );
    button.closest('.candidate').classList.toggle('is-selected', chosen);
  });
  $('#selection-status').textContent =
    phase === 'feedback'
      ? '本段答案已确认，可重听复核。'
      : !sceneHeard
        ? '先完整听一遍现场录音，再试听与选择。'
        : selected === null
          ? '试听后选一位，再点击「确认答案」。'
          : `已选录音 ${letters[selected]}，确认前仍可更改。`;
}

function showError(error) {
  if (error.name === 'AbortError') return;
  player.stop();
  $('#error-message').textContent = error.message || '音频暂时不可用，请重试。';
  $('#error').hidden = false;
  $('#loading').hidden = true;
  $('#start').disabled = false;
  updateControls();
}

function drawRound() {
  const round = rounds[index];
  $('#round-label').textContent = `${String(index + 1).padStart(2, '0')} / 12`;
  $('#stage-label').textContent = round.stage;
  $('#scene-title').textContent = round.title;
  $('#scene-description').textContent = round.description;
  $('#progress').value = index;
  $('#score').textContent = String(results.filter(Boolean).length);
  $('#noise-label').textContent = `杂声 ${index + 1} / 12`;
  $$('.candidate').forEach((card) => card.classList.remove('is-correct', 'is-wrong'));
  updateControls();
}

async function playScene() {
  if (lastPlayback === '现场录音') {
    player.stop();
    return;
  }
  const ticket = generation;
  await player.play(rounds[index].target, {
    level: rounds[index],
    label: '现场录音',
    onEnded: () => {
      if (ticket !== generation) return;
      sceneHeard = true;
      $('#playback-status').textContent = '现场录音已听完，可以试听 A / B / C。';
      updateControls();
    },
  });
}

async function prepareCurrent() {
  player.stop();
  controller?.abort();
  controller = new AbortController();
  const ticket = ++generation;
  selected = null;
  sceneHeard = false;
  results.length = Math.min(results.length, index);
  $('#error').hidden = true;
  setPhase('loading');
  drawRound();
  $('#game').scrollIntoView({ block: 'start', behavior: 'instant' });
  try {
    await player.unlock();
    await player.prepare(rounds[index], controller.signal);
    if (ticket !== generation) return;
    setPhase('playing');
    updateControls();
    if (!document.hidden) await playScene();
  } catch (error) {
    if (ticket === generation) showError(error);
  }
}

async function start() {
  const ticket = ++generation;
  controller?.abort();
  controller = new AbortController();
  $('#start').disabled = true;
  $('#error').hidden = true;
  $('#loading').hidden = false;
  try {
    // Call before the first await: unlock works from a real mobile touch gesture.
    await player.unlock();
    if (!manifest) {
      const response = await fetch(new URL('./assets/audio/manifest.json', import.meta.url), {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('未找到语音素材清单，请从本地服务启动完整游戏。');
      manifest = validateManifest(await response.json());
    }
    if (ticket !== generation) return;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    rounds = createRun(manifest, seed);
    index = 0;
    results = [];
    await prepareCurrent();
  } catch (error) {
    if (ticket === generation) showError(error);
  } finally {
    $('#start').disabled = false;
  }
}

function home() {
  generation++;
  controller?.abort();
  player.suspend();
  $('#error').hidden = true;
  setPhase('intro');
  $('#start').disabled = false;
  $('#start').focus();
}

$('#start').addEventListener('click', start);
$('#restart').addEventListener('click', start);
$('#home').addEventListener('click', home);
$('#retry').addEventListener('click', () => (phase === 'intro' ? start() : prepareCurrent()));
$('#scene-play').addEventListener('click', () => playScene().catch(showError));
$('#stop').addEventListener('click', () => player.stop());

$$('[data-listen]').forEach((button) =>
  button.addEventListener('click', () => {
    const slot = Number(button.dataset.listen);
    const label = `录音 ${letters[slot]}`;
    if (lastPlayback === label) {
      player.stop();
      return;
    }
    player.play(rounds[index].candidates[slot], { label }).catch(showError);
  }),
);

$$('[data-select]').forEach((button) =>
  button.addEventListener('click', () => {
    if (phase !== 'playing' || !sceneHeard) return;
    selected = Number(button.dataset.select);
    updateControls();
  }),
);

$('#confirm').addEventListener('click', () => {
  if (phase !== 'playing' || selected === null || !sceneHeard) return;
  player.stop();
  const result = judge(rounds[index], selected);
  results.push(result.correct);
  setPhase('feedback');
  $('#feedback-title').textContent = result.correct ? '声线吻合' : '这次听岔了';
  $('#feedback-copy').textContent =
    `${result.correct ? '你找到了同一位说话人。' : '正确答案是录音 ' + letters[result.correctIndex] + '。'}可以重听现场，再用干净原声复核。`;
  $(`.candidate[data-slot="${result.correctIndex}"]`).classList.add('is-correct');
  if (!result.correct) $(`.candidate[data-slot="${selected}"]`).classList.add('is-wrong');
  $('#score').textContent = String(results.filter(Boolean).length);
  $('#progress').value = index + 1;
  $('#next').textContent = index === 11 ? '查看挑战结果' : '下一段录音';
  updateControls();
  $('#next').focus({ preventScroll: true });
  $('#feedback').scrollIntoView({ block: 'nearest', behavior: 'instant' });
});

$('#review-correct').addEventListener('click', () => {
  if (phase !== 'feedback') return;
  player.play(rounds[index].target, { label: '现场人声 · 去除背景' }).catch(showError);
});

$('#next').addEventListener('click', () => {
  if (phase !== 'feedback') return;
  player.stop();
  if (index < 11) {
    index++;
    prepareCurrent();
    return;
  }
  generation++;
  setPhase('summary');
  const score = results.filter(Boolean).length;
  $('#final-score').textContent = String(score);
  $('#final-copy').textContent =
    score >= 10
      ? '你在层层杂声里捕捉到了熟悉的声线。'
      : score >= 6
        ? '你找到了不少线索。再试一次，留意气息、厚薄与字尾。'
        : '复杂背景会让耳朵犹豫。重听和比较本身就是这场游戏的乐趣。';
  $('#restart').focus();
});

$('#volume').addEventListener('input', (event) => {
  const value = Number(event.target.value);
  player.setVolume(value / 100);
  $('#volume-label').textContent = `${value}%`;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) player.suspend();
});
window.addEventListener('pagehide', () => {
  generation++;
  controller?.abort();
  player.dispose();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) home();
});
setPhase('intro');
updateControls();
