import { LEVELS, CHAPTERS, PRACTICE, MODES, getLevels } from "./levels.js";
import {
  createGame,
  startGame,
  pauseGame,
  resumeGame,
  stepGame,
  commandCop,
  commandRobber,
  holdRobber,
  holdCop,
  routePreview,
  roadTarget,
  roadDistance,
  isExitBlocked,
  captureStatus,
  CAPTURE_RADIUS,
} from "./engine.js";
import { createRenderer } from "./renderer.js";
import { createAudio } from "./audio.js";
import { openAppearanceSettings, roleAvatarSvg } from "./role-appearance.js";

const $ = (id) => document.getElementById(id);
const STORAGE = "neighborhood-patrol-v1";
const formatTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const ordinal = ["一", "二", "三", "四", "五", "六", "七", "八"];
const copColors = ["#558ead", "#738f86", "#ad925e", "#8f80a7", "#b17f78"];
function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE));
    const records = {
      best: {},
      escapeBest: {},
      teamworkBest: {},
      streetBest: {},
    };
    for (const field of Object.keys(records))
      for (const [id, seconds] of Object.entries(value?.[field] || {})) {
        if (
          /^\d+$/.test(id) &&
          Number(id) >= 1 &&
          Number(id) <= 100 &&
          Number.isFinite(seconds) &&
          seconds > 0 &&
          seconds < 86400
        )
          records[field][Number(id)] = seconds;
      }
    const modeBest = {};
    for (const [key, seconds] of Object.entries(value?.modeBest || {}))
      if (/^(challenge|classic|escape)-(cop|robber)-(100|[1-9]\d?)$/.test(key) && Number.isFinite(seconds) && seconds > 0 && seconds < 86400) modeBest[key] = seconds;
    return { ...records, modeBest, settings: { mode: ["challenge","classic","escape"].includes(value?.settings?.mode) ? value.settings.mode : "challenge", role: value?.settings?.role === "robber" ? "robber" : "cop", initiative: ["first","second","random"].includes(value?.settings?.initiative) ? value.settings.initiative : "random" }, sound: value?.sound !== false, practiceDone: value?.practiceDone === true };
  } catch {
    return {
      best: {},
      escapeBest: {},
      teamworkBest: {},
      streetBest: {},
      modeBest: {},
      sound: true,
    };
  }
}
let progress = readProgress();
const recordKey = id => `${mode}-${playerRole}-${id}`;
const bestTime = id => progress.modeBest[recordKey(id)] || (mode === "challenge" && playerRole === "cop" ? progress.streetBest[id] : null);
let mode = progress.settings?.mode || "challenge", playerRole = progress.settings?.role || "cop", initiative = progress.settings?.initiative || "random";
const controlled = () => game.playerRole === "robber" ? game.robbers : game.cops;
const roleLabel = () => game.playerRole === "robber" ? "突围队" : "追逐队";
const playerWon = () => game.playerRole === "robber" ? game.phase === "lost" : game.phase === "won";
function unlockedLevel() {
  let id = 1;
  while (id < 100 && progress.best[id]) id++;
  return id;
}
let game = createGame(LEVELS[unlockedLevel() - 1]);
let returnLevel = game.level.id, practiceReturn = null, practiceOrders = new Set(), captureHint = null;
let selected = 0,
  pointer = null,
  mousePosition = null,
  hover = null,
  preview = null,
  gesture = null,
  keyboardNode = null;
let chapterTab = game.level.chapter,
  toastTimer = 0,
  winTimer = 0,
  lastHud = 0,
  lastTurnSound = -10;
let lastFrame = performance.now(),
  accumulator = 0,
  frameCount = 0,
  measureStart = lastFrame,
  fps = 0;
let dialogResume = false,
  destroyed = false,
  animationId;
const canvas = $("game-canvas");
const renderer = createRenderer(canvas);
const audio = createAudio(progress.sound);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function saveProgress() {
  progress.settings = {mode, role:playerRole, initiative};
  try {
    localStorage.setItem(STORAGE, JSON.stringify(progress));
  } catch {
    toast("浏览器未允许保存进度，本次游戏仍可继续。", 4500);
  }
}
function toast(message, duration = 2400) {
  clearTimeout(toastTimer);
  $("board-toast").textContent = message;
  $("board-toast").classList.add("visible");
  toastTimer = setTimeout(
    () => $("board-toast").classList.remove("visible"),
    duration,
  );
}
function clearGesture() {
  if (gesture && canvas.hasPointerCapture(gesture.id))
    canvas.releasePointerCapture(gesture.id);
  gesture = null;
  preview = null;
  pointer = null;
  mousePosition = null;
  hover = null;
  canvas.dataset.cursor = "default";
}
function updateSound() {
  $("sound-button").setAttribute("aria-pressed", String(progress.sound));
  $("sound-button").setAttribute(
    "aria-label",
    progress.sound ? "关闭声音" : "打开声音",
  );
}
function selectCop(index, sound = true) {
  if (!controlled()[index] || controlled()[index].caught || controlled()[index].escaped) return;
  clearGesture();
  selected = index;
  keyboardNode = null;
  preview = null;
  if (sound) {
    audio.unlock();
    audio.play("select");
  }
  updateHud();
}
function buildRoster() {
  $("cop-roster").setAttribute("aria-label", `选择${roleLabel()}队员`);
  $("cop-roster").replaceChildren(
    ...controlled().map((cop, i) => {
      const button = document.createElement("button");
      button.className = "cop-card";
      button.dataset.member = String(i + 1);
      button.style.setProperty("--cop-color", copColors[i % copColors.length]);
      button.setAttribute("aria-label", `选择 ${i + 1} 号${roleLabel()}`);
      button.setAttribute("aria-pressed", String(i === selected));
      button.innerHTML = `<svg viewBox="0 0 52 52" aria-hidden="true">${roleAvatarSvg(game.playerRole, 3, 3, 44)}</svg><span class="cop-info"><b>${i + 1} 号<span class="roster-role">${roleLabel()}</span></b><small>待命中</small></span>`;
      button.addEventListener("click", () => selectCop(i));
      return button;
    }),
  );
}
function updateHud() {
  if (game.playerRole === "robber" && (controlled()[selected]?.caught || controlled()[selected]?.escaped)) {
    const next = controlled().findIndex(actor => !actor.caught && !actor.escaped);
    if (next >= 0) selected = next;
  }
  const caught = game.robbers.filter((r) => r.caught).length;
  $("caught-count").textContent = caught;
  $("timer").textContent = formatTime(game.level.timeLimit ? Math.max(0, game.level.timeLimit - game.time) : game.time);
  $("pause-button").disabled = game.phase !== "playing";
  $("hold-button").disabled = game.phase !== "playing";
  $("phase-badge").className = `live-badge ${game.phase}`;
  $("phase-badge").lastElementChild.textContent = game.phase === "playing" && game.time < game.openingSeconds ? `${game.firstRole === "cop" ? "追逐队" : "突围队"}先动 · ${Math.ceil(game.openingSeconds-game.time)} 秒` : {
    ready: "准备行动",
    playing: "实时行动中",
    paused: "行动暂停",
    won: "全员抓获",
    lost: game.playerRole === "robber" ? "突围队获胜" : "挑战结束",
    review: "复盘中 · 本局已结束",
  }[game.phase];
  $("ready-prompt").hidden = !["ready", "won", "lost"].includes(game.phase);
  $("review-controls").hidden = game.phase !== "review";
  $("game-setup").hidden = game.phase !== "ready";
  if (["won", "lost"].includes(game.phase) && playerWon()) {
    $("ready-title").textContent = game.level.id === 0 ? "学会了！两人夹击才是收网。" : `${roleLabel()}获胜！`;
    $("ready-hint").textContent =
      game.level.id === 0 ? "正式街区有岔路：先封出口，再从不同方向靠近。" : `本关用时 ${formatTime(game.time)}。新的行动，等你指挥。`;
    $("start-button").firstChild.textContent =
      game.level.id === 0 ? `${practiceReturn ? "返回" : "挑战"}第 ${returnLevel} 关` : game.level.id === 100 ? "街区地图" : "下一关";
  } else if (["won", "lost"].includes(game.phase)) {
    $("ready-title").textContent = "本局挑战结束，可以复盘或重来。";
    $("ready-hint").textContent = game.playerRole === "robber" ? "更早换向，避开双人夹击；在复盘中观察最后的退路。" : game.exits.length ? "先守住出口，再让同伴从另一侧包抄。" : "借助环路分头包抄，避免跟在同一路线上。";
    $("start-button").firstChild.textContent = "重新挑战";
  }
  const exits = exitStates();
  const danger = game.robbers.filter((r) => !r.escaped && r.escapeProgress > 0)
    .sort((a, b) => b.escapeProgress - a.escapeProgress)[0];
  $("exit-status").textContent = !exits.length ? "无出口 · 限时周旋" : danger
    ? `${exitLabel(danger.exitTarget)} 翻越 · 剩 ${(Math.ceil((1 - danger.escapeProgress) * game.exitHoldSeconds * 10) / 10).toFixed(1)} 秒`
    : `出口 ${exits.filter((exit) => !exit.blocked).length}/${exits.length} 开放`;
  $("exit-status").classList.toggle(
    "danger",
    !!danger || game.phase === "lost",
  );
  updateCaptureHint();
  $("exit-status").classList.toggle(
    "secured",
    exits.length > 0 && exits.every((exit) => exit.blocked),
  );
  document.body.dataset.phase = game.phase;
  document.body.classList.toggle("is-playing", game.phase !== "ready");
  document.body.dataset.level = game.level.id;
  Array.from($("cop-roster").children).forEach((button, index) => {
    button.setAttribute("aria-pressed", String(index === selected));
    button.disabled = !!controlled()[index].caught || !!controlled()[index].escaped;
    button.querySelector("small").textContent =
      controlled()[index].caught ? "已被合围" : controlled()[index].escaped ? "已突围" : game.phase === "ready"
        ? "待命中"
        : controlled()[index].moving
          ? "前往目标"
          : controlled()[index].blocked
            ? game.robbers.some(
                (r) =>
                  r.capture > 0 &&
                  roadDistance(game, controlled()[index], r) <= CAPTURE_RADIUS * 2,
              )
              ? "合力收网"
              : "拦截 · 等待支援"
            : "路口留守";
  });
}
function updateCaptureHint() {
  const practice = game.level.id === 0;
  $("practice-exit").hidden = !practice;
  $("capture-coach").hidden = !["playing", "paused"].includes(game.phase);
  const robber = game.robbers.filter((r) => !r.caught && !r.escaped).sort((a, b) =>
    b.escapeProgress - a.escapeProgress || b.capture - a.capture ||
    roadDistance(game, controlled()[selected], a) - roadDistance(game, controlled()[selected], b))[0];
  captureHint = robber ? { robber, ...captureStatus(game, robber) } : null;
  let message = "队员抵达目标后会停下；换选同伴从另一侧靠近，完成双人合围。";
  if (practice && !practiceOrders.has(0)) {
    message = "练习 1/3 · 点 1 号追逐队员，再点道路中央的蓝圈。";
  } else if (practice && !practiceOrders.has(1)) {
    message = "练习 2/3 · 换选 2 号，再点橙色突围队员，从另一侧追击。";
  } else if (practice && captureHint && !captureHint.enclosed && game.cops.every((cop) => !cop.moving)) {
    const farther = game.cops.reduce((a, b) => roadDistance(game, a, robber) > roadDistance(game, b, robber) ? a : b);
    message = `练习 3/3 · 到点会停：选 ${farther.id + 1} 号，再点突围队员继续夹击。`;
  } else if (captureHint) {
    const { nearby, enclosed } = captureHint;
    message = robber.escapeProgress > 0
      ? `${robber.id + 1} 号在${exitLabel(robber.exitTarget)}翻越！靠近该出口，打断逃脱。`
      : enclosed
        ? `${robber.id + 1} 号 · 双人就位，收网 ${Math.round(robber.capture * 100)}% · 保持 0.8 秒`
        : nearby < 2
          ? `${practice ? "练习 3/3 · " : `${robber.id + 1} 号 · `}近身 ${nearby}/2 人 · 派同伴从另一侧靠近`
          : `${robber.id + 1} 号 · 橙色路段仍可退避，继续压缩包围`;
  }
  $("capture-message").textContent = game.playerRole === "robber" ? (game.exits.length ? "你指挥突围队：点队员，再点道路；任一人越过出口即获胜。" : `你指挥突围队：利用环路避开两侧夹击，坚持 ${game.level.timeLimit} 秒。`) : message;
}
function exitStates() {
  return (game.exits || []).map((exit) => ({
    node: exit.node,
    x: exit.x,
    y: exit.y,
    blocked: isExitBlocked(game, exit),
  }));
}
function exitLabel(node) {
  const index = game.exits.findIndex((exit) => exit.node === node);
  return index < 0 ? "出口" : `出口 ${String.fromCharCode(65 + index)}`;
}
function updateCampaign() {
  const count = getLevels(mode).filter(level => bestTime(level.id)).length;
  $("campaign-count").textContent = `${count} / 100`;
  $("campaign-fill").style.width = `${(count / 100) * 100}%`;
}
function loadLevel(id, saved = null) {
  if (!Number.isInteger(id) || id < 0 || id > 100) return false;
  if (id === 0 && game.level.id > 0) returnLevel = game.level.id;
  clearTimeout(winTimer);
  clearTimeout(toastTimer);
  clearGesture();
  $("board-toast").classList.remove("visible");
  $("board-toast").textContent = "";
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  document.body.classList.remove("modal-open");
  dialogResume = false;
  game = saved?.game || createGame(id === 0 ? PRACTICE : getLevels(mode)[id - 1], {playerRole:id === 0 ? "cop" : playerRole, firstRole:id === 0 || mode === "challenge" ? null : initiative === "random" ? (Math.random() < .5 ? "cop" : "robber") : initiative === "first" ? playerRole : playerRole === "cop" ? "robber" : "cop"});
  if (id !== 0) practiceReturn = null;
  practiceOrders.clear();
  captureHint = null;
  selected = saved?.selected ?? 0;
  keyboardNode = null;
  accumulator = 0;
  lastTurnSound = -10;
  const chapter = CHAPTERS[game.level.chapter];
  $("chapter-name").textContent =
    `第${ordinal[game.level.chapter]}街区 · ${chapter.name}`;
  $("level-number").textContent = String(id).padStart(2, "0");
  $("case-number").hidden = id === 0;
  $("practice-button").hidden = id === 0;
  $("practice-button").textContent = progress.practiceDone ? "重温夹击" : "先练夹击";
  $("mission-title").replaceChildren(
    document.createTextNode(game.level.name),
    Object.assign(document.createElement("span"), {
      className: "title-dot",
      textContent: ".",
    }),
  );
  $("mission-subtitle").textContent =
    id === 0 ? "沿用正式规则 · 不计入关卡成绩" : `${chapter.subtitle} · 挑战 ${game.level.par} 秒${bestTime(id) ? ` · 最佳 ${formatTime(bestTime(id))}` : ""}`;
  $("mode-select").value = mode;
  $("role-select").value = playerRole;
  $("initiative-select").value = initiative;
  $("initiative-select").disabled = mode === "challenge";
  $("initiative-select").title = mode === "challenge" ? "解题挑战固定同时起步" : "先动方提前 2 秒行动";
  $("mode-description").textContent = MODES.find(item => item.id === mode).description;
  $("timer").previousElementSibling.textContent = game.level.timeLimit ? "剩余时间" : "行动用时";
  $("robber-count").textContent = game.robbers.length;
  $("guide-title").textContent = game.level.redeploy?.length
    ? "封口之后，还要换防"
    : id < 3
      ? "先抢出口，再夹击"
      : id < 13
        ? "一个卡位，一个包抄"
        : id < 25
          ? "守住路口，逐个收网"
          : "多口设防，及时补位";
  $("guide-hint").textContent = game.level.hint;
  $("ready-hint").textContent = game.level.briefing || game.level.hint;
  $("ready-title").textContent =
    id === 0 ? "两侧出口已守住，练一次合作夹击。" : id === 1
      ? "盯住橙色出口，别让他翻过去。"
      : `${game.cops.length} 追逐队员 · ${game.robbers.length} 突围队员 · ${(game.level.exits || []).length} 个出口`;
  if(id !== 0) {
    const runner = game.playerRole === "robber";
    const goal = runner ? game.exits.length ? "任意一人越过出口，或坚持到计时结束，即可获胜。" : `利用环路周旋，坚持 ${game.level.timeLimit} 秒即可获胜。`
      : game.exits.length ? "先守出口，再由同伴从另一侧靠近，合围全部对手。" : `限时 ${game.level.timeLimit} 秒，通过岔路包抄，合围全部对手。`;
    $("ready-title").textContent = `${roleLabel()}就位 · ${controlled().length} 名队员由你指挥`;
    $("ready-hint").textContent = goal;
    $("guide-title").textContent = runner ? "看准空档，及时换路" : game.exits.length ? "先封出口，再分头合围" : "分头包抄，压缩退路";
    $("guide-hint").textContent = runner ? goal : game.level.hint;
  }
  $("start-button").firstChild.textContent = id === 0 ? "开始练习" : "开始行动";
  canvas.setAttribute(
    "aria-label",
    `${id === 0 ? "练习" : `第 ${id} 关`} ${game.level.name}，${game.cops.length} 名追逐队员、${game.robbers.length} 名突围队员。${game.level.hint}`,
  );
  buildRoster();
  updateHud();
  updateCampaign();
  return true;
}
function begin() {
  audio.unlock();
  if (["won", "lost"].includes(game.phase) && !playerWon()) {
    loadLevel(game.level.id);
    return;
  }
  if (["won", "lost"].includes(game.phase) && playerWon()) {
    if (game.level.id === 0) leavePractice();
    else if (game.level.id === 100) openLevels();
    else loadLevel(game.level.id + 1);
    return;
  }
  if (!startGame(game)) return;
  audio.play("start");
  accumulator = 0;
  lastFrame = performance.now();
  updateHud();
  window.scrollTo({ top: 0, left: 0 });
  canvas.focus({ preventScroll: true });
}
function issue(point) {
  if (game.phase !== "playing") {
    if (game.phase === "ready") toast("点击“开始行动”，小队就能出发。");
    return false;
  }
  audio.unlock();
  const accepted = (game.playerRole === "robber" ? commandRobber : commandCop)(game, selected, point);
  if (accepted) {
    if (game.level.id === 0 && (Math.abs(point.x - 500) < 45 || game.robbers.includes(point))) practiceOrders.add(selected);
    audio.play("order");
    if (game.time < 5 || game.level.id < 3)
      toast(`${selected + 1} 号收到，正在前往目标。`, 1800);
  } else {
    audio.play("invalid");
    toast(game.time < game.openingSeconds && game.firstRole !== game.playerRole ? "开局待命 2 秒，随后双方同时行动。" : "这里不能通行，请选择未被封住的道路。");
  }
  preview = null;
  updateHud();
  return accepted;
}
function hold() {
  if ((game.playerRole === "robber" ? holdRobber : holdCop)(game, selected)) {
    audio.unlock();
    audio.play("hold");
    clearGesture();
    toast(`${selected + 1} 号，守住这里。`);
    updateHud();
  }
}
function openDialog(id) {
  if ($(id).open) return;
  clearTimeout(winTimer);
  clearGesture();
  dialogResume = game.phase === "playing";
  if (dialogResume) pauseGame(game);
  $(id).showModal();
  document.body.classList.add("modal-open");
  updateHud();
}
function closeDialog(dialog, resume = true) {
  dialog.close();
  if (!document.querySelector("dialog[open]")) {
    document.body.classList.remove("modal-open");
    if (resume && dialogResume && game.phase === "paused" && !document.hidden) {
      resumeGame(game);
      lastFrame = performance.now();
      accumulator = 0;
    }
    dialogResume = false;
  }
  updateHud();
}
function pause(reason = "追逐队员和突围队员都在等你回来。") {
  if (game.phase !== "playing") return;
  $("pause-reason").textContent = reason;
  openDialog("pause-dialog");
}
function renderLevelGrid() {
  const unlocked = unlockedLevel();
  $("chapter-tabs").replaceChildren(
    ...CHAPTERS.map((chapter) => {
      const button = document.createElement("button");
      button.className = "chapter-tab";
      button.textContent = `${ordinal[chapter.id]} · ${chapter.name}`;
      button.setAttribute("aria-pressed", String(chapter.id === chapterTab));
      button.addEventListener("click", () => {
        chapterTab = chapter.id;
        renderLevelGrid();
      });
      return button;
    }),
  );
  $("level-grid").replaceChildren(
    ...getLevels(mode).filter((level) => level.chapter === chapterTab).map((level) => {
      const button = document.createElement("button");
      button.className = `level-tile${game.level.id === level.id ? " current" : ""}`;
      button.disabled = false;
      button.setAttribute(
        "aria-label",
        `第 ${level.id} 关 ${level.name}`,
      );
      const best = bestTime(level.id);
      const roads = level.edges
        .map(
          ([a, b]) =>
            `M${level.nodes[a].x},${level.nodes[a].y}L${level.nodes[b].x},${level.nodes[b].y}`,
        )
        .join("");
      const exits = level.exits
        .map(
          (node) =>
            `<circle cx="${level.nodes[node].x}" cy="${level.nodes[node].y}" r="22" fill="#cc703c"/>`,
        )
        .join("");
      button.innerHTML = `<strong>${String(level.id).padStart(2, "0")}</strong><i class="tile-mark">${best ? (best <= level.par ? "★" : "✓") : "↗"}</i><svg class="level-map" viewBox="0 0 ${level.worldWidth || 1000} ${level.worldHeight || 600}" aria-hidden="true"><path d="${roads}" fill="none" stroke="#638770" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>${exits}</svg><span>${level.name}</span><small>${best ? `最佳 ${formatTime(best)} · 挑战 ${level.par} 秒` : `${level.cops.length} 追 · ${level.robbers.length} 逃 · ${level.edges.length - level.nodes.length + 1} 环路`}</small>`;
      button.addEventListener("click", () => {
        loadLevel(level.id);
        audio.play("select");
      });
      return button;
    }),
  );
}
function openLevels() {
  chapterTab = game.level.chapter;
  renderLevelGrid();
  openDialog("levels-dialog");
}
function won() {
  clearGesture();
  const id = game.level.id;
  if (id === 0) {
    progress.practiceDone = true;
    saveProgress();
    audio.play("win");
    updateHud();
    return;
  }
  const recordEligible = mode === "challenge" && game.playerRole === "cop";
  const previousBest = bestTime(id);
  progress.modeBest[recordKey(id)] = Math.min(previousBest || Infinity, game.time);
  if (recordEligible) {
    progress.streetBest[id] = Math.min(previousBest || Infinity, game.time);
    progress.best[id] ??= game.time;
  }
  saveProgress();
  updateCampaign();
  updateHud();
  audio.play("win");
  $("win-time").textContent = formatTime(game.time);
  $("win-best").textContent = formatTime(progress.modeBest[recordKey(id)]);
  $("win-title").textContent =
    id === 100 ? "全城围捕，圆满收官。" : "一个也没跑掉。";
  $("win-description").textContent =
    id === 100
      ? "本模式最后一关完成！回到街区地图，挑战更漂亮的用时。"
      : previousBest && game.time < previousBest
        ? "刷新个人最佳！这次的收网又快了一点。"
        : game.time <= game.level.par
          ? `全员抓获，并达成 ${game.level.par} 秒街区挑战！`
          : `全员抓获！再试着把用时压进 ${game.level.par} 秒，拿下本关挑战星。`;
  $("next-button").firstChild.textContent =
    id === 100 ? "回到街区地图" : `出发 · 第 ${id + 1} 关`;
  if (game.playerRole === "robber") {
    $("win-title").textContent = "突围队获胜！";
    $("win-description").textContent = game.robbers.some(r => r.escaped) ? "成功越过出口！换个角色，试试如何守住它。" : "坚持到倒计时结束，成功避开合围。";
  }
  toast(`${roleLabel()}获胜！`, 1700);
  winTimer = setTimeout(
    () => {
      if (playerWon()) openDialog("win-dialog");
    },
    reducedMotion.matches ? 250 : 1150,
  );
}
function lost(event) {
  clearGesture();
  audio.play("lose");
  const label = exitLabel(event.exitNode);
  $("lose-title").textContent = game.playerRole === "robber" ? "突围队被合围了。" : event.reason === "timeout" ? "时间到，突围队获胜。" : `${label}失守了。`;
  $("lose-description").textContent = game.playerRole === "robber" ? "两侧退路被追逐队封住。复盘时看看能否更早换路。" : event.reason === "timeout" ? "倒计时结束仍有队员未被合围。尝试分头守住岔路，避免同向追赶。" : `${event.robberId + 1} 号突围队从 ${label} 越过出口。复盘保留最后局面；可随时返回准备或重新挑战。`;
  $("lose-caught").textContent =
    `${game.robbers.filter((r) => r.caught).length} / ${game.robbers.length}`;
  $("lose-time").textContent = formatTime(game.time);
  toast(game.playerRole === "robber" ? "退路被合围，本局结束。" : event.reason === "timeout" ? "时间到，突围队获胜。" : `突围队员从${label}冲线！`, 2000);
  updateHud();
  winTimer = setTimeout(
    () => {
      if (["won", "lost"].includes(game.phase) && !playerWon()) openDialog("lose-dialog");
    },
    reducedMotion.matches ? 200 : 900,
  );
}

function hitActor(clientX, clientY) {
  // Large districts render smaller figures: a fixed CSS hit disk would swallow adjacent roads.
  const origin = renderer.toScreen({x:0,y:0}), edge = renderer.toScreen({x:26,y:0});
  let hit = null,
    nearest = Math.max(4, Math.min(26, Math.abs(edge.x-origin.x)));
  const actors = [
    ...game.cops.map((actor) => ({ actor, cop: true })),
    ...game.robbers
      .filter((actor) => !actor.caught && !actor.escaped)
      .map((actor) => ({ actor, cop: false })),
  ];
  for (const { actor, cop } of actors) {
    const screen = renderer.toScreen({ x: actor.x, y: actor.y - 28 });
    const foot = renderer.toScreen(actor);
    const distance = Math.min(
      Math.hypot(clientX - screen.x, clientY - screen.y),
      Math.hypot(clientX - foot.x, clientY - foot.y),
    );
    if (distance < nearest) {
      // Input hit.cop means selectable (our team); physical actor types stay in the engine.
      hit = { actor, cop: cop === (game.playerRole !== "robber") };
      nearest = distance;
    }
  }
  return hit;
}
function updateHover() {
  hover = null;
  let cursor = "default";
  if (mousePosition && ["ready", "playing"].includes(game.phase)) {
    hover = hitActor(mousePosition.x, mousePosition.y);
    if (gesture?.cop >= 0 && game.phase === "playing") cursor = "drag";
    else if (hover) cursor = hover.cop ? "cop" : "robber";
    else if (
      game.phase === "playing" &&
      roadTarget(game, renderer.toWorld(mousePosition.x, mousePosition.y))
    )
      cursor = "road";
  }
  if (canvas.dataset.cursor !== cursor) canvas.dataset.cursor = cursor;
}
canvas.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0))
    return;
  event.preventDefault();
  audio.unlock();
  canvas.focus({ preventScroll: true });
  const hit = hitActor(event.clientX, event.clientY);
  if (hit?.cop) selectCop(hit.actor.id);
  if (event.pointerType === "mouse")
    mousePosition = { x: event.clientX, y: event.clientY };
  gesture = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    cop: hit?.cop ? hit.actor.id : -1,
    dragged: false,
  };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!event.isPrimary) return;
  if (event.pointerType === "mouse")
    mousePosition = { x: event.clientX, y: event.clientY };
  const hit = hitActor(event.clientX, event.clientY);
  const point =
    hit && !hit.cop
      ? hit.actor
      : renderer.toWorld(event.clientX, event.clientY);
  if (gesture && gesture.id === event.pointerId) {
    gesture.dragged ||=
      Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      ) > 8;
    if (gesture.dragged && gesture.cop >= 0) {
      preview = routePreview(game, selected, point);
      pointer = roadTarget(game, point);
    }
  } else if (event.pointerType === "mouse" && game.phase === "playing") {
    pointer = hit?.cop ? null : roadTarget(game, point);
    preview = hit?.cop ? null : routePreview(game, selected, point);
  }
});
canvas.addEventListener("pointerup", (event) => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const { cop, dragged } = gesture;
  const hit = hitActor(event.clientX, event.clientY);
  const point =
    hit && !hit.cop
      ? hit.actor
      : renderer.toWorld(event.clientX, event.clientY);
  clearGesture();
  if ((cop < 0 && !dragged) || (cop >= 0 && dragged)) issue(point);
  if (event.pointerType === "mouse")
    mousePosition = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointercancel", clearGesture);
canvas.addEventListener("lostpointercapture", () => {
  gesture = null;
  preview = null;
  updateHover();
});
canvas.addEventListener("pointerleave", () => {
  mousePosition = null;
  hover = null;
  canvas.dataset.cursor = "default";
  if (!gesture) {
    pointer = null;
    preview = null;
  }
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function keyboardTarget(key) {
  canvas.focus({ preventScroll: true });
  const graph = game.graph;
  if (keyboardNode === null) {
    keyboardNode = graph.nodes.reduce(
      (best, node, i) =>
        Math.hypot(
          node.x - controlled()[selected].x,
          node.y - controlled()[selected].y,
        ) <
        Math.hypot(
          graph.nodes[best].x - controlled()[selected].x,
          graph.nodes[best].y - controlled()[selected].y,
        )
          ? i
          : best,
      0,
    );
  }
  const origin = graph.nodes[keyboardNode];
  const direction = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowDown: [0, 1],
    ArrowUp: [0, -1],
  }[key];
  const candidates = graph.adjacent[keyboardNode].map(({ node }) => ({
    node,
    dx: graph.nodes[node].x - origin.x,
    dy: graph.nodes[node].y - origin.y,
  }));
  const next = candidates
    .filter((c) => c.dx * direction[0] + c.dy * direction[1] > 0)
    .sort(
      (a, b) =>
        (b.dx * direction[0] + b.dy * direction[1]) / Math.hypot(b.dx, b.dy) -
        (a.dx * direction[0] + a.dy * direction[1]) / Math.hypot(a.dx, a.dy),
    )[0];
  if (next) keyboardNode = next.node;
  pointer = graph.nodes[keyboardNode];
  preview = routePreview(game, selected, pointer);
  toast(
    `目标路口：${graph.nodes[keyboardNode].label || keyboardNode + 1}，按回车下令。`,
    2000,
  );
}
document.addEventListener("keydown", (event) => {
  if (
    document.querySelector("dialog[open]") ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    selectCop(Number(event.key) - 1);
  } else if (event.key === "Escape" || event.key.toLowerCase() === "p") {
    event.preventDefault();
    pause();
  } else if (event.key.toLowerCase() === "h") {
    event.preventDefault();
    hold();
  } else if (game.phase === "playing" && event.key.startsWith("Arrow")) {
    event.preventDefault();
    keyboardTarget(event.key);
  } else if (
    game.phase === "playing" &&
    event.key === "Enter" &&
    pointer &&
    document.activeElement === canvas
  ) {
    event.preventDefault();
    issue(pointer);
  }
});

$("start-button").addEventListener("click", begin);
function practice() {
  if (game.level.id > 0 && ["playing", "paused"].includes(game.phase)) {
    pauseGame(game);
    practiceReturn = { game, selected };
  }
  loadLevel(0);
  begin();
}
function leavePractice() {
  loadLevel(returnLevel, practiceReturn);
  if (game.phase === "paused") {
    $("pause-reason").textContent = "练习结束，原来的布置和用时已保留。准备好后继续。";
    openDialog("pause-dialog");
    dialogResume = true;
  }
}
$("practice-button").addEventListener("click", practice);
$("help-practice").addEventListener("click", practice);
$("pause-practice").addEventListener("click", practice);
$("practice-exit").addEventListener("click", leavePractice);
$("hold-button").addEventListener("click", hold);
$("pause-button").addEventListener("click", () => pause());
$("resume-button").addEventListener("click", () =>
  closeDialog($("pause-dialog")),
);
$("restart-button").addEventListener("click", () => loadLevel(game.level.id));
$("pause-restart").addEventListener("click", () => loadLevel(game.level.id));
$("win-retry").addEventListener("click", () => loadLevel(game.level.id));
$("lose-retry").addEventListener("click", () => loadLevel(game.level.id));
$("lose-review").addEventListener("click", () => {
  game.phase = "review";
  closeDialog($("lose-dialog"), false);
});
$("review-return").addEventListener("click", () => loadLevel(game.level.id));
$("review-retry").addEventListener("click", () => {loadLevel(game.level.id); begin();});
$("mode-select").addEventListener("change", event => {mode = event.target.value; saveProgress(); loadLevel(1);});
$("role-select").addEventListener("change", event => {playerRole = event.target.value; saveProgress(); loadLevel(game.level.id || 1);});
$("initiative-select").addEventListener("change", event => {initiative = event.target.value; saveProgress(); loadLevel(game.level.id || 1);});
$("appearance-button").addEventListener("click", () => openAppearanceSettings(buildRoster));
$("next-button").addEventListener("click", () => {
  if (game.level.id === 100) {
    closeDialog($("win-dialog"), false);
    openLevels();
  } else loadLevel(game.level.id + 1);
});
$("win-levels").addEventListener("click", () => {
  closeDialog($("win-dialog"), false);
  openLevels();
});
$("levels-button").addEventListener("click", openLevels);
$("help-button").addEventListener("click", () => openDialog("help-dialog"));
$("sound-button").addEventListener("click", () => {
  progress.sound = !progress.sound;
  audio.setEnabled(progress.sound);
  audio.play("select");
  saveProgress();
  updateSound();
});
function displayChanged() {
  renderer.resize();
  clearGesture();
}
document.addEventListener("fullscreenchange", displayChanged);
document.addEventListener("game-displaychange", displayChanged);
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      closeDialog(button.closest("dialog")),
    ),
  );
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  }),
);
document.addEventListener("visibilitychange", () => {
  clearGesture();
  if (document.hidden) pause("你刚刚离开了页面。准备好后，再继续行动。");
});
window.addEventListener("blur", () => {
  if (!document.querySelector("dialog[open]"))
    pause("窗口暂时失去焦点，行动已为你暂停。");
  clearGesture();
});
window.addEventListener("resize", () => {
  renderer.resize();
  clearGesture();
});
let competitionPaused = false;
window.addEventListener("competition-visibility", ({ detail }) => {
  if (detail?.open) {
    clearGesture();
    competitionPaused = pauseGame(game) || competitionPaused;
    updateHud();
  } else if (competitionPaused) {
    competitionPaused = false;
    if (game.phase !== "paused") return;
    $("pause-reason").textContent = "好友赛已关闭，单人行动仍保留在离开时的局面。";
    openDialog("pause-dialog");
    dialogResume = true;
  }
});

function frame(now) {
  if (destroyed) return;
  const elapsed = Math.max(0, Math.min((now - lastFrame) / 1000, 0.05));
  lastFrame = now;
  if (game.phase === "playing") {
    accumulator += elapsed;
    while (accumulator >= 1 / 60 && game.phase === "playing") {
      stepGame(game, 1 / 60);
      accumulator -= 1 / 60;
    }
  } else accumulator = 0;
  for (const event of game.events.splice(0)) {
    if (event.type === "capture") {
      audio.play("capture");
      toast(`抓到 ${event.robberId + 1} 号突围队员！继续盯住其他路口。`);
    } else if (event.type === "win" || event.type === "lose") { if (playerWon()) won(); else lost(event); }
    else if (event.type === "turn" && game.time - lastTurnSound > 0.8) {
      audio.play("turn");
      lastTurnSound = game.time;
    }
  }
  updateHover();
  renderer.draw(game, {
    selected,
    preview,
    pointer,
    hover,
    captureHint,
    practiceTarget: game.level.id === 0 && game.phase === "playing" && !practiceOrders.has(0),
    reducedMotion: reducedMotion.matches,
    now,
  });
  if (now - lastHud > 120) {
    updateHud();
    lastHud = now;
  }
  frameCount++;
  if (now - measureStart > 1000) {
    fps = (frameCount * 1000) / (now - measureStart);
    frameCount = 0;
    measureStart = now;
  }
  animationId = requestAnimationFrame(frame);
}

// Read-only inspection supports browser playtests without injecting state or fake wins.
export function getSnapshot() {
  const actor = (a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    moving: a.moving,
    caught: !!a.caught,
    escaped: !!a.escaped,
    escapeProgress: a.escapeProgress || 0,
    exitTarget: a.exitTarget ?? null,
    blocked: !!a.blocked,
    capture: a.capture || 0,
    destination: a.destination && { x: a.destination.x, y: a.destination.y },
  });
  return {
    level: game.level.id,
    mode,
    role: game.playerRole,
    phase: game.phase,
    time: game.time,
    selected,
    fps,
    firstRole: game.firstRole,
    openingSeconds: game.openingSeconds,
    cops: game.cops.map(actor),
    robbers: game.robbers.map(actor),
    exits: exitStates(),
    unlocked: unlockedLevel(),
    audio: progress.sound,
    nodes: game.level.nodes.map((p) => ({ ...p })),
  };
}
export function worldToScreen(point) {
  return renderer.toScreen(point);
}

loadLevel(game.level.id);
updateSound();
animationId = requestAnimationFrame(frame);
window.addEventListener("pagehide", (event) => {
  clearGesture();
  pauseGame(game);
  if (!event.persisted) {
    destroyed = true;
    cancelAnimationFrame(animationId);
    renderer.destroy();
  }
});
window.addEventListener("pageshow", (event) => {
  if (
    event.persisted &&
    game.phase === "paused" &&
    !document.querySelector("dialog[open]")
  ) {
    dialogResume = true;
    $("pause-dialog").showModal();
    document.body.classList.add("modal-open");
    updateHud();
  }
});
