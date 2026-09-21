import "./style.css";
import { rounds, cities } from "./rounds.js";
import {
  chooseRounds,
  ROUND_COUNT,
  scoreGuess,
  formatYear,
  formatDistance,
  formatPoint,
  clamp,
  MIN_YEAR,
  MAX_YEAR,
  LIMIT_SECONDS,
  remainingSeconds,
  restoreJourney,
} from "./game.js";

const $ = (selector) => document.querySelector(selector);
const app = $("#app");
const icons = {
  compass:
    '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sound:
    '<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5Zm5 5 6 6m0-6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-8H9v8H3Z"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.compass}</svg>`;
const brand = `<span class="brand-mark">${icon("compass")}</span><span>此时<span class="brand-dot">·</span>此地<small>把好奇心，交给时间</small></span>`;
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let saved = { best: 0, visited: [], sound: true };
try {
  const value = JSON.parse(localStorage.getItem("here-and-then.v1"));
  if (value && typeof value === "object")
    saved = {
      best: Number.isInteger(value.best) ? clamp(value.best, 0, 25000) : 0,
      visited: Array.isArray(value.visited)
        ? value.visited.filter((id) => rounds.some((r) => r.id === id))
        : [],
      sound: value.sound !== false,
      journey: value.journey,
    };
} catch {
  /* A new travel journal is usable even when browser storage is unavailable. */
}
let storageNotice = false;
function save() {
  try {
    localStorage.setItem("here-and-then.v1", JSON.stringify(saved));
  } catch {
    if (!storageNotice) {
      toast("浏览器未允许保存，记录将在本次打开期间保留");
      storageNotice = true;
    }
  }
}
let viewer = null,
  guessMap = null,
  clock = null,
  generation = 0,
  audio = null,
  screenEvents = new AbortController();
let state = {
  screen: "home",
  region: "all",
  timed: false,
  practice: "",
  deck: [],
  index: 0,
  results: [],
  phase: "idle",
  guess: null,
  year: 1000,
  yearTouched: false,
  view: "scene",
};
function saveJourney() {
  if (state.screen !== "game" || !["guessing", "revealed"].includes(state.phase)) return;
  saved.journey = {
    version: 1, region: state.region, timed: state.timed, practice: state.practice,
    deck: state.deck.map((round) => round.id), index: state.index,
    results: state.results.map(({ id, guess, year, timedOut }) => ({ id, guess, year, timedOut })),
    phase: state.phase, guess: state.guess, year: state.year,
    yearTouched: state.yearTouched, deadline: state.deadline,
  };
  save();
}
function on(selector, event, fn) {
  $(selector)?.addEventListener(event, fn, { signal: screenEvents.signal });
}
function toast(text) {
  let node = $("#toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "toast";
    node.setAttribute("role", "status");
    document.body.append(node);
  }
  node.textContent = text;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3500);
}
function chime(success = false) {
  if (!saved.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume().catch(() => {});
    (success ? [392, 494, 587] : [392]).forEach((frequency, i) => {
      const oscillator = audio.createOscillator(),
        gain = audio.createGain(),
        start = audio.currentTime + i * 0.1;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.055, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.4);
    });
  } catch {
    /* Audio is optional; gameplay never depends on audio permission. */
  }
}
function cleanup() {
  generation++;
  clearInterval(clock);
  screenEvents.abort();
  screenEvents = new AbortController();
  viewer?.destroy();
  guessMap?.destroy();
  viewer = null;
  guessMap = null;
}
function soundButton() {
  return `<button class="icon-button" id="sound" aria-label="${saved.sound ? "关闭" : "开启"}音效" aria-pressed="${saved.sound}" title="${saved.sound ? "关闭" : "开启"}音效">${icon(saved.sound ? "sound" : "mute")}</button>`;
}
function bindSound() {
  on("#sound", "click", () => {
    saved.sound = !saved.sound;
    save();
    $("#sound").outerHTML = soundButton();
    bindSound();
    chime();
  });
}
function modal(title, content) {
  $("#modal")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "modal";
  dialog.className = "paper-dialog";
  dialog.innerHTML = `<div class="dialog-top"><span class="eyebrow">旅行手记</span><button class="icon-button" aria-label="关闭弹窗">${icon("close")}</button></div><h2>${title}</h2>${content}`;
  document.body.append(dialog);
  dialog.querySelector("button").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  dialog.showModal();
  return dialog;
}
function help() {
  modal(
    "如何读懂一瞬历史",
    `<ol class="guide"><li><strong>环顾四周</strong><p>单指拖动全景，双指捏合缩放。桌面也可使用鼠标、滚轮与方向键。</p></li><li><strong>留下坐标</strong><p>打开地图，点选位置或搜索中文城市。地图展示现代地理位置，古地名可用“长安”“汴京”搜索。</p></li><li><strong>拨回时间</strong><p>拖动年份滑杆、选择时代，或直接输入年份。公元前通过左侧切换；没有公元 0 年。</p></li><li><strong>揭晓一段往事</strong><p>每幕地点与年代各 2500 分，每局 ${ROUND_COUNT} 幕，满分 ${ROUND_COUNT * 5000}。指定场景练习为单幕，不计入五幕最佳分。地点误差 30 公里内满分，年代宽容随场景线索调整；提示不扣分。</p></li></ol><p class="fine-print">${rounds.length} 幕场景均为 AI 历史想象复原，可能包含时代或建筑细节偏差，不能作为史料。具体年份是游戏设定；揭晓页附可查阅资料。限时模式每幕 90 秒，切到后台继续计时；自由漫游不限时。</p>`,
  );
}
function journal() {
  modal(
    "走过的地方，都有回响",
    `<p class="muted">已收集 ${saved.visited.length} / ${rounds.length} 幕 · 本机五幕最佳 ${saved.best.toLocaleString("zh-CN")} 分</p><div class="journal-grid">${rounds.map((r) => (saved.visited.includes(r.id) ? `<button class="journal-card" data-story="${r.id}"><img src="${r.image}" alt="${r.place}的历史想象复原" loading="lazy"><strong>${r.place}</strong><small>${formatYear(r.year)} · ${r.era}</small></button>` : `<div class="journal-card locked">${icon("book")}<strong>尚未抵达</strong><small>完成探索后收录</small></div>`)).join("")}</div>`,
  );
  document.querySelectorAll("[data-story]").forEach(
    (button) =>
      (button.onclick = () => {
        const r = rounds.find((r) => r.id === button.dataset.story);
        modal(r.title, storyMarkup(r));
      }),
  );
}
function storyMarkup(round) {
  return `<p class="eyebrow">${round.place} · ${formatYear(round.year)}</p><p class="story-text">${round.story}</p><ul class="detail-list">${round.details.map((d) => `<li>${d}</li>`).join("")}</ul><a class="source-link" href="${round.source[1]}" target="_blank" rel="noopener noreferrer">${round.source[0]} ↗</a><p class="fine-print">AI 历史想象复原 · 场景设定不等于精确史实</p>`;
}
function cluesMarkup(round) {
  return `<div class="reasoning"><h3>回看线索，串起推理</h3><p>${escape(round.hint)}</p><ul class="detail-list">${round.details.map((detail) => `<li>${escape(detail)}</li>`).join("")}</ul><small>图像只提供猜测方向；${formatYear(round.year)}是游戏设定，按 ±${round.tolerance} 年宽容计分。</small></div>`;
}
function home() {
  saveJourney();
  const journey = restoreJourney(saved.journey, rounds);
  const cover = rounds.find((round) => round.id === "kaifeng") || rounds[0];
  cleanup();
  state.screen = "home";
  state.phase = "idle";
  document.body.className = "home-page";
  app.innerHTML = `<div class="home-shell"><header class="site-header"><a class="brand" href="./" aria-label="此时此地首页">${brand}</a><nav aria-label="主导航"><button id="journal">${icon("book")}<span>我的足迹</span><b>${saved.visited.length.toString().padStart(2, "0")}</b></button><button id="help">玩法指南</button>${soundButton()}</nav></header>
    <main><section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="red-line"></span>一场穿越时空的旅行</div><h1>此地，似曾相识。<br>此时，<em>是哪一年？</em></h1><p class="hero-description">走进历史的一瞬，环顾四周。<br>从一座城、一件衣裳、一缕烟火里，<br>找到你在时间中的坐标。</p>
      <div class="travel-options"><fieldset><legend>选择旅途</legend><div class="segmented"><label><input type="radio" name="region" value="all" ${state.region === "all" ? "checked" : ""}><span>${icon("compass")}世界漫游</span></label><label><input type="radio" name="region" value="china" ${state.region === "china" ? "checked" : ""}><span>${icon("pin")}中国足迹</span></label></div></fieldset><label class="timed-option"><input type="checkbox" id="timed" ${state.timed ? "checked" : ""}><span class="toggle"></span>限时挑战 <small>90 秒 / 幕</small></label></div>
      <label class="scene-picker" for="scene-select">指定场景练习<select id="scene-select"><option value="">随机旅途 · 每局 ${ROUND_COUNT} 幕</option>${["china", "world"].map((region) => `<optgroup label="${region === "china" ? "中国历史" : "世界历史"}">${rounds.filter((r) => r.region === region).map((r) => `<option value="${r.id}">${escape(r.title)}</option>`).join("")}</optgroup>`).join("")}</select></label>
      ${journey ? `<div class="resume-journey"><button class="primary" id="resume">继续上次旅途 · 第 ${journey.index + 1} / ${journey.deck.length} 幕 ${icon("arrow")}</button><small>地点、年代与进度已保留${journey.timed ? " · 限时仍按原截止时间计时" : " · 不限时"}</small></div>` : ""}
      <button class="${journey ? "secondary" : "primary"} start-button" id="start">${journey ? "另开新旅途" : "开启时空之旅"} ${icon("arrow")}</button><p class="start-note" id="start-note">${journey ? "另开会替换未完成旅途" : `每局 ${ROUND_COUNT} 幕 · 默认不限时`} <span>·</span> 优先探索未见场景</p>
    </div><figure class="hero-postcard"><div class="postcard-image"><img src="${cover.image}" alt="${escape(cover.place)}的历史想象复原" fetchpriority="high"><span class="image-corner">历史的另一种打开方式</span><div class="panorama-badge">${icon("eye")}<span>360°<small>沉浸式观察</small></span></div></div><figcaption><span><i>第 001 号时空切片</i><strong>人间烟火，穿越千年。</strong></span><span class="postcard-stamp">山河<br>故人</span></figcaption><span class="postcard-edge" aria-hidden="true"></span></figure></section>
    <section class="how-strip" aria-label="三步开始探索"><div><span class="step-number">壹</span><p><strong>观其景</strong><small>转动视角，发现细节</small></p>${icon("eye")}</div><div><span class="step-number">贰</span><p><strong>辨其地</strong><small>展开地图，落下坐标</small></p>${icon("pin")}</div><div><span class="step-number">叁</span><p><strong>知其时</strong><small>拨动年份，揭开往事</small></p>${icon("clock")}</div></section>
    </main><footer class="site-footer"><span>${rounds.length} 幕历史想象 · 中国 ${rounds.filter((r) => r.region === "china").length} 幕 · 世界 ${rounds.filter((r) => r.region === "world").length} 幕</span><span>AI 场景复原 <span class="footer-dot">·</span> 中文地理底图 <span class="footer-dot">·</span> 为好奇心而作</span></footer></div>`;
  on("#start", "click", () => {
    state.region = $('input[name="region"]:checked').value;
    state.timed = $("#timed").checked;
    state.practice = $("#scene-select").value;
    start();
  });
  on("#resume", "click", () => start(journey));
  on("#scene-select", "change", (event) => {
    const practice = Boolean(event.target.value);
    $("#start").innerHTML = `${practice ? "走进这一幕" : journey ? "另开新旅途" : "开启时空之旅"} ${icon("arrow")}`;
    $("#start-note").textContent = `${practice ? "单幕练习 · 不计入五幕最佳分" : `每局 ${ROUND_COUNT} 幕 · 优先探索未见场景`}${journey ? " · 会替换未完成旅途" : ""}`;
  });
  on("#help", "click", help);
  on("#journal", "click", journal);
  bindSound();
}
async function start(journey = null) {
  cleanup();
  chime();
  state = journey ? { ...state, ...journey, screen: "game", phase: "loading" } : {
    ...state,
    screen: "game",
    deck: state.practice ? rounds.filter((r) => r.id === state.practice) : chooseRounds(rounds, state.region, Math.random, saved.visited),
    index: 0,
    results: [],
    phase: "loading",
  };
  document.body.className = "game-page";
  app.innerHTML = `<main class="game-shell"><header class="game-header"><button class="brand compact" id="leave" aria-label="返回首页">${brand}</button><div class="round-progress"><span id="round-label">第 1 幕 / ${state.deck.length}</span><div id="progress-dots" aria-hidden="true"></div></div><div class="game-status"><span id="timer">${state.timed ? "90 秒" : "自由漫游"}</span><span id="total-score">0 <small>分</small></span>${soundButton()}<button class="icon-button" id="fullscreen" aria-label="进入全屏" title="进入全屏">${icon("full")}</button></div></header>
      <div class="game-body"><section class="scene-pane" aria-label="历史场景"><div id="panorama" tabindex="0" role="group" aria-label="历史全景，拖动环顾，双指或滚轮缩放"></div><div class="scene-top"><span class="scene-tag">${icon("eye")} 观察 · 寻找线索</span><button id="hint" class="glass-button">一点提示</button></div><div id="hint-text" class="hint-bubble" hidden></div><div class="scene-controls"><button class="glass-button" id="reset-view" aria-label="重置全景视角">${icon("compass")}</button><button class="glass-button" id="zoom-in" aria-label="放大全景">＋</button><button class="glass-button" id="zoom-out" aria-label="缩小全景">−</button></div><div class="scene-caption"><span class="eyebrow">此刻，你身在何方？</span><p id="clue"></p><small>拖动环顾 · 双指缩放 <span>｜</span> AI 历史想象复原</small></div></section>
      <aside class="map-pane"><div class="map-heading"><div><span class="eyebrow">第一步 · 在地图上留下坐标</span><h2>你觉得，这里是哪里？</h2></div>${icon("pin")}</div><div class="search-wrap"><label class="search-box">${icon("search")}<input id="city-search" type="search" placeholder="搜索中文城市或古地名" aria-label="搜索中文城市或古地名" autocomplete="off"><span>⌕</span></label><div id="search-results" class="search-results" hidden></div></div><div class="map-stage"><div id="guess-map"></div><span class="map-crosshair" aria-hidden="true">＋</span><div class="map-tools"><button id="map-plus" aria-label="放大地图">＋</button><button id="map-minus" aria-label="缩小地图">−</button></div><button class="center-pin" id="center-pin">${icon("pin")}标记地图中心</button><span class="map-credit">Natural Earth · 地理示意</span></div><div class="location-status" id="location-status" role="status">${icon("pin")}<span>点击地图，标记你的猜测</span></div></aside></div>
      <div class="guess-dock"><div class="mobile-tabs" role="group" aria-label="切换观察和地图"><button id="scene-tab" class="active" aria-pressed="true">${icon("eye")}观察场景</button><button id="map-tab" aria-pressed="false">${icon("pin")}地图选点 <i id="pin-dot"></i></button></div><div class="timeline"><div class="timeline-heading"><label for="year-range">第二步 · 这是哪一年？</label><div class="year-editor"><select id="era-select" aria-label="公元前或公元"><option value="ce">公元</option><option value="bce">公元前</option></select><input id="year-number" type="number" inputmode="numeric" min="1" max="2026" value="1000" aria-label="猜测年份"><span>年</span></div><span class="year-status" id="year-status">请选择年代</span></div><input id="year-range" type="range" min="${MIN_YEAR}" max="${MAX_YEAR}" value="1000" step="1" aria-label="拖动选择年份"><div class="era-stops"><button data-year="-2000">古文明</button><button data-year="-221">秦汉</button><button data-year="750">隋唐</button><button data-year="1100">宋元</button><button data-year="1600">明清</button><button data-year="1900">近现代</button></div></div><div class="submit-area"><button class="primary" id="submit" disabled>请先选择地点与年代 ${icon("arrow")}</button><span id="submit-note">两枚坐标，拼出一个历史瞬间</span></div></div>
      <div class="load-cover" id="load-cover" role="status"><span class="loading-compass">${icon("compass")}</span><h2>正在翻开历史的一页</h2><p>一场相遇，即将发生。</p></div><div class="result-overlay" id="result-overlay" hidden></div></main>`;
  bindSound();
  on("#leave", "click", () => {
    const dialog = modal(
      "暂别这段旅途？",
      '<p>地点、年代和本局进度会自动保留，首页可继续。限时旅途仍按原截止时间计时。</p><div class="dialog-actions"><button class="secondary" id="stay">继续探索</button><button class="primary" id="exit">保存并返回首页</button></div>',
    );
    dialog.querySelector("#stay").onclick = () => dialog.close();
    dialog.querySelector("#exit").onclick = () => {
      dialog.close();
      home();
    };
  });
  on("#fullscreen", "click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else toast("当前浏览器不支持全屏，可横屏获得更大视野");
    } catch {
      toast("当前浏览器未允许全屏，可继续正常游玩");
    }
  });
  on("#hint", "click", () => {
    $("#hint-text").hidden = !$("#hint-text").hidden;
    $("#hint-text").textContent = state.deck[state.index].hint;
    $("#hint").textContent = $("#hint-text").hidden ? "一点提示" : "收起提示";
  });
  on("#reset-view", "click", () => viewer?.reset());
  on("#zoom-in", "click", () => viewer?.zoom(-8));
  on("#zoom-out", "click", () => viewer?.zoom(8));
  on("#scene-tab", "click", () => setView("scene"));
  on("#map-tab", "click", () => setView("map"));
  on("#map-plus", "click", () => guessMap?.zoom(1));
  on("#map-minus", "click", () => guessMap?.zoom(-1));
  on("#center-pin", "click", () => guessMap?.center());
  on("#city-search", "input", searchCities);
  on("#city-search", "keydown", (event) => {
    if (event.key === "Escape") $("#search-results").hidden = true;
    if (event.key === "Enter") {
      $("#search-results button")?.click();
      event.preventDefault();
    }
  });
  on("#year-range", "input", (event) =>
    setYear(Number(event.target.value) || 1),
  );
  const editYear = () => {
    const field = $("#year-number"),
      max = $("#era-select").value === "bce" ? 3000 : MAX_YEAR;
    if (
      field.value === "" ||
      !Number.isInteger(field.valueAsNumber) ||
      field.valueAsNumber < 1 ||
      field.valueAsNumber > max
    ) {
      field.setAttribute("aria-invalid", "true");
      state.yearTouched = false;
      $("#year-status").textContent = `请输入 1～${max}`;
      updateSubmit();
      saveJourney();
      return;
    }
    setYear(field.valueAsNumber * ($("#era-select").value === "bce" ? -1 : 1));
  };
  on("#year-number", "input", editYear);
  on("#era-select", "change", () => {
    $("#year-number").max =
      $("#era-select").value === "bce" ? "3000" : String(MAX_YEAR);
    editYear();
  });
  document
    .querySelectorAll("[data-year]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => setYear(Number(button.dataset.year)),
        { signal: screenEvents.signal },
      ),
    );
  on("#submit", "click", () => reveal(false));
  on("#panorama", "viewererror", () => {
    clearInterval(clock);
    const journey = restoreJourney(saved.journey, rounds);
    state.phase = "error";
    showLoadError("画面连接已中断，请重新载入这一幕", async () => {
      const { createViewer } = await import("./viewer.js");
      viewer?.destroy();
      viewer = createViewer($("#panorama"));
      await loadRound(journey?.index === state.index ? journey : null);
    });
  });
  const token = generation;
  try {
    const [{ createViewer }, { createGuessMap }] = await Promise.all([
      import("./viewer.js"),
      import("./map.js"),
    ]);
    if (token !== generation) return;
    viewer = createViewer($("#panorama"));
    const map = await createGuessMap($("#guess-map"), (point) => {
      if (state.phase !== "guessing") return;
      state.guess = point;
      $("#location-status").innerHTML =
        `${icon("pin")}<span><strong>${escape(point.name)}</strong><small>${formatPoint(point)}</small></span><b>已标记</b>`;
      $("#pin-dot").classList.add("set");
      updateSubmit();
      saveJourney();
    });
    if (token !== generation) {
      map.destroy();
      return;
    }
    guessMap = map;
    await loadRound(journey);
  } catch (error) {
    if (token === generation) showLoadError(error.message, () => start(journey));
  }
}
function showLoadError(message, retry) {
  $("#load-cover").hidden = false;
  $("#load-cover").innerHTML =
    `${icon("compass")}<h2>这一页没能打开</h2><p>${escape(message)}</p><button class="primary" id="retry">重新载入</button><button class="secondary" id="load-home">返回首页</button>`;
  $("#retry").onclick = retry;
  $("#load-home").onclick = home;
}
async function loadRound(journey = null) {
  const round = state.deck[state.index],
    token = ++generation;
  clearInterval(clock);
  state.phase = "loading";
  state.guess = null;
  state.year = 1000;
  state.yearTouched = false;
  $("#result-overlay").hidden = true;
  $("#result-overlay").innerHTML = "";
  $("#load-cover").hidden = false;
  $("#load-cover").innerHTML =
    `<span class="loading-compass">${icon("compass")}</span><h2>正在翻开历史的一页</h2><p>一场相遇，即将发生。</p>`;
  $("#round-label").textContent = `第 ${state.index + 1} 幕 / ${state.deck.length}`;
  $("#progress-dots").innerHTML = state.deck
    .map(
      (_, i) =>
        `<i class="${i < state.index ? "done" : i === state.index ? "current" : ""}"></i>`,
    )
    .join("");
  $("#clue").textContent = round.clue;
  $("#hint-text").hidden = true;
  $("#hint").textContent = "一点提示";
  $("#city-search").value = "";
  $("#city-search").disabled = false;
  $("#search-results").hidden = true;
  $("#location-status").innerHTML =
    `${icon("pin")}<span>点击地图，标记你的猜测</span>`;
  $("#pin-dot").classList.remove("set");
  $("#center-pin").disabled = false;
  $("#year-range").disabled = false;
  $("#year-number").disabled = false;
  $("#era-select").disabled = false;
  $("#year-number").removeAttribute("aria-invalid");
  setYear(journey ? journey.year : 1000, journey ? journey.yearTouched : false);
  guessMap.reset(state.practice ? (round.region === "china" ? "china" : "all") : state.region);
  setView("scene");
  try {
    await viewer.load(round);
    if (token !== generation) return;
    state.phase = "guessing";
    $("#load-cover").hidden = true;
    updateSubmit();
    state.deadline = journey ? journey.deadline : Date.now() + LIMIT_SECONDS * 1000;
    if (journey?.guess) guessMap.goTo(journey.guess);
    $("#total-score").innerHTML = `${state.results.reduce((n, r) => n + r.total, 0).toLocaleString("zh-CN")} <small>分</small>`;
    if (journey?.phase === "revealed") {
      state.phase = "revealed";
      renderResult();
      saveJourney();
      return;
    }
    saveJourney();
    $("#timer").textContent = state.timed ? `${LIMIT_SECONDS} 秒` : "自由漫游";
    if (state.timed) {
      clock = setInterval(tick, 250);
      tick();
    }
    $("#panorama").focus({ preventScroll: true });
  } catch (error) {
    if (token === generation) {
      state.phase = "error";
      showLoadError(error.message, () => loadRound(journey));
    }
  }
}
function tick() {
  if (state.phase !== "guessing") return;
  const seconds = remainingSeconds(state.deadline, Date.now());
  $("#timer").textContent = `${seconds} 秒`;
  $("#timer").classList.toggle("urgent", seconds <= 15);
  if (seconds === 0) reveal(true);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.timed && state.screen === "game") tick();
});
function setView(view) {
  state.view = view;
  $(".game-shell")?.classList.toggle("show-map", view === "map");
  for (const name of ["scene", "map"]) {
    $(`#${name}-tab`)?.classList.toggle("active", view === name);
    $(`#${name}-tab`)?.setAttribute("aria-pressed", String(view === name));
  }
  guessMap?.resize();
  viewer?.setActive(
    view === "scene" || matchMedia("(min-width: 901px)").matches,
  );
  viewer?.resize();
}
window.addEventListener("resize", () => {
  if (state.screen === "game") setView(state.view);
});
function searchCities() {
  const query = $("#city-search").value.trim(),
    results = $("#search-results");
  if (!query) {
    results.hidden = true;
    return;
  }
  const matches = cities
    .filter((city) => city.name.includes(query))
    .slice(0, 6);
  results.innerHTML = matches.length
    ? matches
        .map(
          (city) =>
            `<button data-city="${escape(city.name)}">${icon("pin")}${escape(city.name)}<small>在地图上标记</small></button>`,
        )
        .join("")
    : "<p>未收录这个城市，仍可在地图上点选。</p>";
  results.hidden = false;
  results.querySelectorAll("button").forEach(
    (button) =>
      (button.onclick = () => {
        const city = cities.find((c) => c.name === button.dataset.city);
        guessMap.goTo(city);
        $("#city-search").value = city.name;
        results.hidden = true;
        $("#city-search").blur();
        chime();
      }),
  );
}
function setYear(year, touched = true) {
  if (state.phase === "revealed") return;
  state.year = clamp(Math.round(year) || 1, MIN_YEAR, MAX_YEAR);
  state.yearTouched = touched;
  $("#year-range").value = state.year;
  $("#year-range").setAttribute("aria-valuetext", formatYear(state.year));
  $("#year-range").style.setProperty(
    "--progress",
    `${((state.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100}%`,
  );
  $("#era-select").value = state.year < 0 ? "bce" : "ce";
  $("#year-number").value = Math.abs(state.year);
  $("#year-number").max = state.year < 0 ? "3000" : String(MAX_YEAR);
  $("#year-number").removeAttribute("aria-invalid");
  $("#year-status").textContent = touched ? "年代已选" : "请选择年代";
  updateSubmit();
  saveJourney();
}
function updateSubmit() {
  const ready = state.phase === "guessing" && state.guess && state.yearTouched;
  $("#submit").disabled = !ready;
  $("#submit").innerHTML =
    `${ready ? "落笔，揭晓这一刻" : !state.guess ? "请先在地图上选择地点" : "再选一个年代，就可以出发"} ${icon("arrow")}`;
}
function reveal(timedOut) {
  if (
    state.phase !== "guessing" ||
    (!timedOut && (!state.guess || !state.yearTouched))
  )
    return;
  state.phase = "revealed";
  clearInterval(clock);
  $("#modal")?.close();
  $("#search-results").hidden = true;
  const round = state.deck[state.index],
    score = scoreGuess(
      round,
      state.guess,
      state.yearTouched ? state.year : null,
    );
  state.results.push({
    id: round.id,
    guess: state.guess,
    year: state.yearTouched ? state.year : null,
    timedOut,
    ...score,
  });
  saved.visited = saved.visited.filter((id) => id !== round.id);
  saved.visited.push(round.id);
  saveJourney();
  chime(true);
  navigator.vibrate?.(30);
  renderResult();
}
function renderResult() {
  const round = state.deck[state.index], score = state.results[state.index], timedOut = score.timedOut;
  $("#total-score").innerHTML =
    `${state.results.reduce((n, r) => n + r.total, 0).toLocaleString("zh-CN")} <small>分</small>`;
  $("#submit").disabled = true;
  $("#year-range").disabled = true;
  $("#year-number").disabled = true;
  $("#era-select").disabled = true;
  $("#center-pin").disabled = true;
  $("#city-search").disabled = true;
  guessMap.reveal(state.guess, round);
  viewer.setActive(false);
  const overlay = $("#result-overlay");
  overlay.innerHTML = `<section class="result-card" aria-labelledby="result-title"><div class="result-top"><span class="eyebrow">${timedOut ? "时间到 · 此刻揭晓" : "时空坐标，已揭晓"}</span><button class="text-button" id="compare-map">${icon("pin")}对照地图</button></div><div class="result-heading"><div><p class="result-place">${round.place}</p><h2 id="result-title">${round.title}</h2><p class="answer-year">${formatYear(round.year)} <span>· ${round.era}</span></p></div><div class="score-stamp"><strong>${score.total.toLocaleString("zh-CN")}</strong><small>本幕得分 / 5000</small></div></div>
    <div class="score-breakdown"><div>${icon("pin")}<span>地点误差<strong>${score.distance === null ? "尚未落点" : formatDistance(score.distance)}</strong></span><b>+${score.locationScore}</b></div><div>${icon("clock")}<span>年代误差<strong>${score.years === null ? "尚未选择" : `${score.years.toLocaleString("zh-CN")} 年`}</strong></span><b>+${score.timeScore}</b></div></div><p class="guess-recap">你的猜测：${state.guess ? escape(state.guess.name) : "未选择地点"} · ${state.yearTouched ? formatYear(state.year) : "未选择年代"} <span>年代满分宽容 ±${round.tolerance} 年</span></p>${cluesMarkup(round)}<p class="story-text">${round.story}</p><a class="source-link" href="${round.source[1]}" target="_blank" rel="noopener noreferrer">${round.source[0]} ↗</a><div class="result-bottom"><span>此刻已收录进「我的足迹」<small>AI 历史想象复原 · 查看资料了解真实历史</small></span><button id="next" class="primary">${state.index === state.deck.length - 1 ? "查看旅行手记" : "前往下一幕"} ${icon("arrow")}</button></div></section>`;
  overlay.hidden = false;
  $("#next").onclick = () => {
    if (state.index === state.deck.length - 1) finish();
    else {
      state.index++;
      loadRound();
    }
  };
  $("#compare-map").onclick = () => {
    overlay.hidden = true;
    setView("map");
    $("#submit").innerHTML = "返回历史解说";
    $("#submit").disabled = false;
    $("#submit").onclick = () => {
      if (state.phase === "revealed") {
        overlay.hidden = false;
        $("#submit").disabled = true;
        $("#submit").onclick = null;
        $("#next").focus();
      }
    };
    toast("朱红「猜」是你的坐标，青绿「真」是场景坐标");
  };
  $("#next").focus({ preventScroll: true });
}
function finish() {
  const total = state.results.reduce((sum, result) => sum + result.total, 0);
  if (!state.practice && state.results.length === ROUND_COUNT) saved.best = Math.max(saved.best, total);
  saved.journey = null;
  save();
  cleanup();
  state.screen = "finish";
  state.phase = "finished";
  document.body.className = "home-page";
  const ratio = total / (state.deck.length * 5000);
  const title =
    ratio >= 0.8
      ? "山河与岁月，都认得你。"
      : ratio >= 0.48
        ? "你离历史，又近了一步。"
        : "每次相遇，都是新的发现。";
  app.innerHTML = `<div class="summary-shell"><header class="site-header"><button id="home" class="brand">${brand}</button><span class="eyebrow">本次时空之旅 · 已完成</span></header><main><section class="summary-heading"><span class="eyebrow">旅行手记 / 第 ${saved.visited.length.toString().padStart(2, "0")} 枚足迹</span><h1>${title}</h1><div class="final-score">${total.toLocaleString("zh-CN")}<small>/ ${(state.deck.length * 5000).toLocaleString("zh-CN")} 分</small></div><p>走过 ${state.deck.length} 幕光景，把陌生的年代变成记忆。</p></section><div class="summary-rounds">${state.results
    .map((result, i) => {
      const round = rounds.find((r) => r.id === result.id);
      return `<article class="summary-row"><span class="row-number">0${i + 1}</span><img src="${round.image}" alt="${round.place}历史想象复原"><div><strong>${round.place}</strong><p>${formatYear(round.year)} · ${round.era}</p></div><div class="summary-errors"><span>${result.distance === null ? "未落点" : formatDistance(result.distance)}</span><span>${result.years === null ? "未选年代" : `相差 ${result.years} 年`}</span></div><b>${result.total.toLocaleString("zh-CN")}<small> / 5000</small></b></article>`;
    })
    .join(
      "",
    )}</div><div class="summary-actions"><button class="secondary" id="journal">${icon("book")}翻看我的足迹</button><button class="primary" id="again">${state.practice ? "再练这一幕" : "再赴一场相遇"} ${icon("arrow")}</button></div><p class="summary-best">${state.practice ? "单幕练习不计入五幕纪录 · " : ""}本机五幕最佳 ${saved.best.toLocaleString("zh-CN")} 分 · 已探索 ${saved.visited.length} / ${rounds.length} 幕</p></main></div>`;
  on("#home", "click", home);
  on("#again", "click", () => start());
  on("#journal", "click", journal);
  window.scrollTo(0, 0);
}
home();
