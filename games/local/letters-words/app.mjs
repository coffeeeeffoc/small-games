import {
  randomWords,
  parseWords,
  letters,
  createGame,
  available,
  pick,
  undo,
  clearDraft,
  checkAnswer,
  selectTarget,
  hint,
} from "./game.mjs";

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
  tiles = new Map();
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
  const word = game.entries[game.target].word;
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
        ? `第 ${position + 1} 格 ${game.draft[position]}，点击撤回到此格`
        : `第 ${position + 1} 格，待填写`,
    );
    slot.addEventListener("click", () => {
      if (locked) return;
      game.draft.length = position;
      clearFeedback();
      render();
      feedback("已撤回到这一格，换个字母试试。");
    });
    $("answer").append(slot);
  }
  $("answer").setAttribute(
    "aria-label",
    `当前拼写：${game.draft.join("") || "尚未填写"}`,
  );
}

function renderWordList() {
  $("progress").max = game.entries.length;
  $("progress").value = game.completed.size;
  $("progress-count").replaceChildren(
    document.createTextNode(`${game.completed.size} `),
    element("span", "", `/ ${game.entries.length}`),
  );
  $("word-list").replaceChildren();
  game.entries.forEach((entry, index) => {
    const completed = game.completed.has(index);
    const current = index === game.target && !completed;
    const li = element("li");
    const button = element(
      "button",
      `word-item${current ? " current" : ""}${completed ? " completed" : ""}`,
    );
    button.type = "button";
    button.dataset.index = index;
    button.disabled = completed || locked;
    button.setAttribute(
      "aria-label",
      `${entry.meaning}，${completed ? `已完成 ${entry.word}` : current ? "正在拼写" : "点击开始拼写"}`,
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
      if (locked || index === game.target) return;
      if (selectTarget(game, index)) {
        clearFeedback();
        render();
        feedback("换一个词，换一点新思路。");
      }
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
}

function render() {
  const entry = game.entries[game.target];
  $("challenge-number").textContent =
    `WORD ${String(game.target + 1).padStart(2, "0")} / ${String(game.entries.length).padStart(2, "0")}`;
  $("meaning").textContent = entry.meaning;
  const count = letters(entry.word).length;
  $("letter-count").textContent =
    `${count} 个字母${/[.'-]/.test(entry.word) ? "与符号" : ""}${entry.word.includes(" ") ? " · 空格已为你留好" : ""}`;
  renderAnswer();
  updateBoard();
  renderWordList();
  updateControls();
}

function clearFeedback() {
  highlighted = undefined;
  $("challenge").classList.remove("is-correct", "is-incorrect");
}

function choose(char) {
  if (locked || !pick(game, char)) return;
  clearFeedback();
  render();
  if (game.draft.length < letters(game.entries[game.target].word).length) {
    playSound();
    feedback("字母就位，继续拼出你的答案。");
    return;
  }
  const solved = game.entries[game.target];
  const result = checkAnswer(game);
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
    render();
    if (result === "finished") finishGame();
    else feedback(`「${solved.word}」已收好，接着拼下一个吧。`, "success");
  }, 650);
}

function startGame(entries = randomWords()) {
  const next = createGame(entries);
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
  feedback(`你已经收集了 ${game.entries.length} 个好词！`, "success");
  const cleared = element("div", "empty-board");
  cleared.innerHTML = `${icon("leaf")}<strong>这片花园，收获满满</strong><span>全部字母已消除 · 再来一局吧</span>`;
  $("board").replaceChildren(cleared);
  $("win-stats").replaceChildren();
  [
    [game.entries.length, "单词已记住"],
    [game.moves, "次选字"],
    [game.hints, "次提示"],
  ].forEach(([value, label]) => {
    const stat = element("div");
    stat.append(element("strong", "", value), element("span", "", label));
    $("win-stats").append(stat);
  });
  $("win-words").replaceChildren(
    ...game.entries.map(({ word, meaning }) =>
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
  render();
  if (highlighted)
    feedback(
      `${before && !game.draft.length ? "先帮你清空错序字母。" : ""}下一块是「${highlighted}」，点亮的那一块就是。`,
    );
});
$("new-game").addEventListener("click", () => startGame());
$("play-again").addEventListener("click", () => startGame());
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
  $("words-input").value = game.entries
    .map(({ word, meaning }) => `${word}\t${meaning}`)
    .join("\n");
  $("words-error").textContent = "";
  $("words-dialog").showModal();
});
$("random-words").addEventListener("click", () => {
  $("words-input").value = randomWords()
    .map(({ word, meaning }) => `${word}\t${meaning}`)
    .join("\n");
  $("words-error").textContent = "";
});
$("words-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const entries = parseWords($("words-input").value);
    startGame(entries);
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
    event.target.closest('input, textarea, [contenteditable="true"]')
  )
    return;
  if (event.key === "Backspace") {
    event.preventDefault();
    removeLast();
  } else if (event.key === "Escape") {
    event.preventDefault();
    removeAll();
  } else if (/^[a-z.'‘’-]$/i.test(event.key)) {
    event.preventDefault();
    choose(event.key.toLowerCase().replace(/[‘’]/g, "'"));
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && audio?.state === "running")
    void audio.suspend().catch(() => {});
});

startGame();
