import {
  randomWords,
  parseWords,
  formatWords,
  letters,
  createGame,
  available,
  pick,
  undo,
  clearDraft,
  checkAnswer,
  hint,
  removeDraft,
  isBlocked,
  reshuffle,
  canSpell,
} from "./game.mjs";
import { practiceBatches } from './library.mjs';
import { setupLibrary } from './library-ui.mjs';

const $ = (id) => document.getElementById(id);
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
let game;
let tiles = new Map();
let locked = false;
let transition;
let celebration;
let highlighted;
let soundEnabled = true;
let audio;
let practice;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function playSound(kind = "pick") {
  if (!soundEnabled) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") void audio.resume().catch(() => {});
    const notes =
      kind === "win"
        ? [523, 659, 784, 1047]
        : kind === "correct"
          ? [523, 659, 784]
          : kind === "error"
            ? [220, 196]
            : [440 + game.draft.length * 35];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      const start = audio.currentTime + index * 0.1;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0, start);
      volume.gain.linearRampToValueAtTime(0.055, start + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.001, start + 0.17);
      oscillator.connect(volume).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
      oscillator.onended = () => {
        oscillator.disconnect();
        volume.disconnect();
      };
    });
  } catch {
    /* Sound is optional on browsers without Web Audio. */
  }
}

function feedback(text, type = "") {
  $("feedback").textContent = text;
  $("feedback").className = `feedback ${type}`;
}

function buildBoard() {
  $("board").replaceChildren();
  $("board").classList.toggle('overlap-board', game.overlap);
  $("board").style.aspectRatio = game.overlap ? `350 / ${game.boardHeight}` : '';
  tiles = new Map();
  if (game.overlap) {
    for (const tile of game.tiles) {
      const button = element('button', 'letter-tile overlap-tile', tile.char);
      button.type = 'button';
      button.dataset.char = tile.char;
      button.dataset.tileId = tile.id;
      button.style.left = `${tile.x / 350 * 100}%`;
      button.style.top = `${tile.y / game.boardHeight * 100}%`;
      button.style.width = `${tile.size / 350 * 100}%`;
      button.style.height = `${tile.size / game.boardHeight * 100}%`;
      button.style.zIndex = tile.z;
      button.addEventListener('click', () => {
        const selected = game.selected.indexOf(tile.id);
        if (selected >= 0 && !locked) { removeDraft(game, selected); clearFeedback(); render(); }
        else choose(tile.char, tile.id);
      });
      tiles.set(tile.id, button); $('board').append(button);
    }
    return;
  }
  const characters = [...game.remaining.keys()];
  for (let index = characters.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [characters[index], characters[swap]] = [
      characters[swap],
      characters[index],
    ];
  }
  characters.forEach((char) => {
    const button = element("button", "letter-tile");
    button.type = "button";
    button.dataset.char = char;
    button.append(
      element("span", "tile-letter", char),
      element("span", "tile-count"),
    );
    button.addEventListener("click", () => choose(char));
    tiles.set(char, button);
    $("board").append(button);
  });
}

function updateBoard() {
  let total = 0;
  let kinds = 0;
  if (game.overlap) {
    for (const [id, button] of tiles) {
      const tile = game.tiles[id];
      const blocked = isBlocked(tile, game.tiles);
      const selected = game.selected.includes(id);
      button.disabled = locked || blocked || tile.removed;
      button.hidden = tile.removed;
      button.classList.toggle('blocked', blocked);
      button.classList.toggle('selected', selected);
      button.classList.toggle('hinted', !blocked && !selected && tile.char === highlighted);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${tile.char}，${blocked ? '被遮挡，暂不可选' : selected ? '已选，点击放回' : '可以选择'}`);
    }
    const remaining = game.tiles.filter(tile => !tile.removed);
    $('board-summary').textContent = `还剩 ${remaining.length} 块 · ${remaining.filter(tile => !isBlocked(tile, game.tiles)).length} 块已露出 · 已选 ${game.draft.length} 块`;
    return;
  }
  for (const [char, button] of tiles) {
    const stock = game.remaining.get(char);
    const count = available(game, char);
    total += stock;
    if (stock) kinds++;
    button.disabled = locked || count === 0;
    button.classList.toggle("exhausted", stock === 0);
    button.classList.toggle("reserved", stock > 0 && count === 0);
    button.classList.toggle("hinted", char === highlighted && count > 0);
    button.querySelector(".tile-count").textContent = count;
    button.dataset.count = count;
    button.dataset.stock = stock;
    const spoken =
      char === "'"
        ? "英文撇号"
        : char === "-"
          ? "连字符"
          : char === "."
            ? "句点"
            : char;
    button.setAttribute("aria-label", `${spoken}，还可选 ${count} 个`);
  }
  $("board-summary").textContent =
    `还剩 ${total} 块字母与符号 · ${kinds} 种棋子${game.draft.length ? ` · 已选 ${game.draft.length} 块` : ""}`;
}

function renderAnswer() {
  const word = game.ordered ? game.entries[game.target].word : game.draft.join('');
  $("answer").replaceChildren();
  $("answer").classList.toggle("long-word", letters(word).length > 10);
  let index = 0;
  for (const char of word) {
    if (char === " ") {
      const space = element("span", "answer-space");
      space.setAttribute("aria-label", "空格");
      $("answer").append(space);
      continue;
    }
    const position = index++;
    const filled = position < game.draft.length;
    const slot = element(
      "button",
      `answer-slot ${filled ? "filled" : "empty"}${position === game.draft.length ? " next" : ""}`,
      game.draft[position] || "",
    );
    slot.type = "button";
    slot.disabled = locked || !filled;
    slot.setAttribute(
      "aria-label",
      filled
        ? `第 ${position + 1} 格 ${game.draft[position]}，点击放回此字母`
        : `第 ${position + 1} 格，待填写`,
    );
    slot.addEventListener("click", () => {
      if (locked) return;
      removeDraft(game, position);
      clearFeedback();
      render();
      feedback("已放回这个字母，其他选择保持不变。");
    });
    $("answer").append(slot);
  }
  $("answer").setAttribute(
    "aria-label",
    `当前拼写：${game.draft.join("") || "尚未填写"}`,
  );
  if (!game.ordered && !game.draft.length) $('answer').append(element('span', 'draft-placeholder', '先选字母，再点中文词义确认'));
}

function renderWordList() {
  const home = $(game.ordered ? 'word-list-home' : 'free-clues');
  if ($('word-list').parentElement !== home) home.append($('word-list'));
  $('free-clues').hidden = game.ordered;
  const completedCount = practice.done + game.completed.size;
  $('batch-number').textContent = `第 ${practice.index + 1}/${practice.batches.length} 批`;
  $('practice-progress').textContent = `${practice.title} · 总进度 ${completedCount}/${practice.entries.length} · 第 ${practice.index + 1}/${practice.batches.length} 批 · 本批 ${game.entries.length} 个词${practice.index + 1 < practice.batches.length ? '，拼完自动继续下一批' : '，这是最后一批'}`;
  $("progress").max = practice.entries.length;
  $("progress").value = completedCount;
  $("progress-count").replaceChildren(
    document.createTextNode(`${completedCount} `),
    element("span", "", `/ ${practice.entries.length}`),
  );
  $("word-list").replaceChildren();
  game.entries.forEach((entry, index) => {
    const completed = game.completed.has(index);
    if (completed && !game.ordered) return;
    const current = game.ordered && index === game.target && !completed;
    const li = element("li");
    const button = element(
      "button",
      `word-item${current ? " current" : ""}${completed ? " completed" : ""}`,
    );
    button.type = "button";
    button.dataset.index = index;
    button.disabled = completed || locked || (game.ordered && !current);
    button.setAttribute(
      "aria-label",
      `${entry.meaning}，${completed ? `已完成 ${entry.word}` : game.ordered ? current ? '正在拼写' : '等待按序练习' : '点击确认匹配'}`,
    );
    if (current) button.setAttribute("aria-current", "step");
    const number = element(
      "span",
      "word-index",
      String(index + 1).padStart(2, "0"),
    );
    if (completed) number.innerHTML = icon("check");
    const copy = element("span", "word-copy");
    copy.append(element("span", "", entry.meaning));
    if (completed) copy.append(element("small", "", entry.word));
    const status = element("span", "word-status");
    if (current) status.innerHTML = icon("arrow");
    button.append(number, copy, status);
    button.addEventListener("click", () => {
      if (!locked && !game.ordered) submit(index);
    });
    li.append(button);
    $("word-list").append(li);
  });
}

function updateControls() {
  $("undo-button").disabled = locked || !game.draft.length;
  $("clear-button").disabled = locked || !game.draft.length;
  $("hint-button").disabled =
    locked || game.completed.size === game.entries.length;
  $('hint-button').hidden = !game.ordered;
  $('shuffle-button').hidden = !game.overlap;
  $('shuffle-button').disabled = locked || game.completed.size === game.entries.length;
}

function render() {
  const entry = game.entries[game.target];
  $("challenge-number").textContent =
    `本批第 ${game.target + 1} / ${game.entries.length} 词`;
  $("meaning").textContent = game.ordered ? entry.meaning : '自由拼词';
  const count = letters(entry.word).length;
  $("letter-count").textContent =
    game.ordered ? `${count} 个字母${/[^a-z ]/.test(entry.word) ? "与符号" : ""}${entry.word.includes(" ") ? " · 空格已为你留好" : ""}` : `已选 ${game.draft.length} 个字母与符号 · 不提示目标长度`;
  $('clue-instruction').textContent = game.ordered ? '请拼出这个词' : '选字母，再点词义';
  $('word-list-tip').textContent = game.ordered ? '按当前词义拼写，填满后自动检查' : '点击中文词义确认；匹配成功才消除';
  $('mode-label').textContent = `${game.overlap ? '重叠' : '平铺'} · ${game.ordered ? '按序拼写' : '自由匹配'}`;
  $('board-rule').textContent = game.overlap ? '被压住不可选 · 卡住可重新排列' : '右上角数字 = 可选数量';
  renderAnswer();
  updateBoard();
  renderWordList();
  updateControls();
}

function clearFeedback() {
  highlighted = undefined;
  $("challenge").classList.remove("is-correct", "is-incorrect");
}

function choose(char, tileId) {
  if (locked || !pick(game, char, tileId)) return;
  clearFeedback();
  render();
  if (!game.ordered || game.draft.length < letters(game.entries[game.target].word).length) {
    playSound();
    feedback(game.ordered ? '字母就位，继续拼出你的答案。' : '选好后，点击词单中的中文含义确认。');
    return;
  }
  submit(game.target);
}

function submit(index) {
  const solved = game.entries[index];
  const result = checkAnswer(game, index);
  if (result === 'incomplete') { feedback('先选择字母，再点对应的中文含义。'); return; }
  if (result === "incorrect") {
    $("challenge").classList.add("is-incorrect");
    feedback("还差一点点！字母没有消耗，撤回或清空再试试。", "error");
    playSound("error");
    return;
  }
  locked = true;
  document.querySelectorAll(".answer-slot").forEach((slot) => {
    slot.disabled = true;
  });
  $("challenge").classList.add("is-correct");
  feedback(`拼对了！${solved.word} · ${solved.meaning}`, "success");
  playSound(result === "finished" ? "win" : "correct");
  updateBoard();
  renderWordList();
  updateControls();
  transition = setTimeout(() => {
    locked = false;
    clearFeedback();
    if (result === 'finished') {
      practice.moves += game.moves;
      practice.hints += game.hints;
      if (practice.index + 1 < practice.batches.length) {
        practice.done += game.entries.length;
        practice.index++;
        startBatch();
        feedback('这批拼完了！继续下一批，直到练完本次选出的单词。', 'success');
        return;
      }
    }
    if (game.overlap) buildBoard();
    render();
    if (result === "finished") finishGame();
    else feedback(`「${solved.word}」已收好，接着拼下一个吧。`, "success");
  }, 650);
}

function startPractice(entries = randomWords(), title = '随手练一组', count = null) {
  const batches = practiceBatches(entries, Math.random, count);
  for (const batch of batches) createGame(batch);
  const wasPlaying = !!game;
  practice = { sourceEntries: entries, entries: batches.flat(), count, title, batches, index: 0, done: 0, moves: 0, hints: 0 };
  startBatch();
  if (wasPlaying && matchMedia('(max-width: 760px)').matches)
    document.querySelector('.play-card').scrollIntoView({ block: 'start' });
}

function startBatch() {
  const next = createGame(practice.batches[practice.index], {
    overlap: $('overlap-mode').checked, ordered: $('ordered-mode').checked,
  });
  clearTimeout(transition);
  clearTimeout(celebration);
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  $("confetti").replaceChildren();
  $("challenge").classList.remove("is-finished");
  game = next;
  locked = false;
  clearFeedback();
  buildBoard();
  render();
  feedback("↓ 点击下方字母，开始拼写吧");
}

function finishGame() {
  $("challenge").classList.add("is-finished");
  $("challenge-number").textContent = "ALL WORDS COLLECTED";
  $("meaning").textContent = "全部拼对啦";
  $("letter-count").textContent = "一块不剩，刚刚好。";
  $("answer").replaceChildren();
  feedback(`你已经练完所选的 ${practice.entries.length} 个单词！`, "success");
  const cleared = element("div", "empty-board");
  cleared.innerHTML = `${icon("leaf")}<strong>这片花园，收获满满</strong><span>全部字母已消除 · 再来一局吧</span>`;
  $("board").replaceChildren(cleared);
  $("win-stats").replaceChildren();
  [
    [practice.entries.length, "单词已练习"],
    [practice.moves, "次选字"],
    [practice.hints, "次提示"],
  ].forEach(([value, label]) => {
    const stat = element("div");
    stat.append(element("strong", "", value), element("span", "", label));
    $("win-stats").append(stat);
  });
  $("win-words").replaceChildren(
    ...practice.entries.map(({ word, meaning }) =>
      element("span", "", `${word} · ${meaning}`),
    ),
  );
  if (!document.querySelector("dialog[open]")) $("win-dialog").showModal();
  for (let index = 0; index < 36; index++) {
    const piece = element("i");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = ["#a2b87b", "#d8ba73", "#7c9e89", "#dfac8b"][
      index % 4
    ];
    piece.style.animationDelay = `${Math.random() * 0.45}s`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 180}px`);
    piece.style.borderRadius = index % 2 ? "50%" : "2px";
    $("confetti").append(piece);
  }
  celebration = setTimeout(() => $("confetti").replaceChildren(), 3100);
}

function removeLast() {
  if (locked || !undo(game)) return;
  clearFeedback();
  render();
  feedback("已撤回一个字母，慢慢来。");
}

function removeAll() {
  if (locked || !game.draft.length) return;
  clearDraft(game);
  clearFeedback();
  render();
  feedback("字母都回到棋盘了，再试一次吧。");
}

$("undo-button").addEventListener("click", removeLast);
$("clear-button").addEventListener("click", removeAll);
$("hint-button").addEventListener("click", () => {
  if (locked) return;
  const before = game.draft.join("");
  clearFeedback();
  highlighted = hint(game);
  if (game.overlap && !canSpell(game, game.target)) {
    reshuffle(game); buildBoard(); highlighted = hint(game);
  }
  render();
  if (highlighted)
    feedback(
      `${before && !game.draft.length ? "先帮你清空错序字母。" : ""}下一块是「${highlighted}」，点亮的那一块就是。`,
    );
});
const restart = () => startPractice(practice.sourceEntries, practice.title, practice.count);
$("new-game").addEventListener("click", restart);
$("play-again").addEventListener("click", restart);
for (const id of ['ordered-mode', 'overlap-mode']) $(id).addEventListener('change', restart);
$('shuffle-button').addEventListener('click', () => {
  if (locked) return;
  reshuffle(game); clearFeedback(); buildBoard(); render();
  feedback('已放回选择并重新排列，完成进度保留。');
});
$("sound-button").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  $("sound-button").setAttribute("aria-pressed", String(soundEnabled));
  $("sound-button").setAttribute(
    "aria-label",
    soundEnabled ? "关闭音效" : "开启音效",
  );
  $("sound-button").innerHTML = icon(soundEnabled ? "sound" : "mute");
  if (soundEnabled) playSound();
});
$("help-button").addEventListener("click", () => $("help-dialog").showModal());
$("edit-words").addEventListener("click", () => {
  $("words-input").value = formatWords(practice.entries.length <= 12 ? practice.entries : game.entries);
  $("words-error").textContent = "";
  $("words-dialog").showModal();
});
$("random-words").addEventListener("click", () => {
  $("words-input").value = formatWords(randomWords());
  $("words-error").textContent = "";
});
$("words-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const entries = parseWords($("words-input").value);
    startPractice(entries, '自定义词单');
  } catch (error) {
    $("words-error").textContent = error.message;
  }
});
document
  .querySelectorAll(".close-dialog")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
document.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    document.querySelector("dialog[open]") ||
    event.target.closest('input, select, textarea, [contenteditable="true"]')
  )
    return;
  if (event.key === "Backspace") {
    event.preventDefault();
    removeLast();
  } else if (event.key === "Escape") {
    event.preventDefault();
    removeAll();
  } else if (/^[a-z0-9.'‘’!?()/=…⋯-]$/i.test(event.key)) {
    event.preventDefault();
    choose(event.key.toLowerCase().replace(/[‘’]/g, "'"));
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && audio?.state === "running")
    void audio.suspend().catch(() => {});
});

setupLibrary(startPractice);
startPractice();
