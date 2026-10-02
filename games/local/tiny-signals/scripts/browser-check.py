#!/usr/bin/env python3
"""Exercise the local prototype through Chromium, without modifying game state.

Requires the environment's Python Playwright and /usr/bin/chromium. Start the
local server first, then run this file. Optional arguments: origin URL and
--regressions-only (runs lifecycle and queued-input checks without screenshots).
"""

import json
from pathlib import Path
import re
import subprocess
import sys

from playwright.sync_api import sync_playwright, expect


GAME_DIR = Path(__file__).resolve().parents[1]
ARTIFACTS = GAME_DIR.parents[2] / ".scratch" / "tiny-signals"
ORIGIN = next((arg for arg in sys.argv[1:] if not arg.startswith("--")), "http://127.0.0.1:5186/")
REGRESSIONS_ONLY = "--regressions-only" in sys.argv
SAVE_KEY = "tiny-signals:host:tiny-signals.progress.v1"
KEYS = {"up": "ArrowUp", "right": "ArrowRight", "down": "ArrowDown", "left": "ArrowLeft"}


def load_fixtures():
    # Rules are only used to discover an authentic failure path. Every move and
    # assertion below goes through the rendered game's public controls.
    source = r"""
      import { LEVELS } from './levels.mjs';
      import { createState, step, stateKey, DIRECTIONS } from './rules.mjs';
      const level = LEVELS[5];
      const queue = [{ state: createState(level), path: [] }];
      const seen = new Set([stateKey(queue[0].state)]);
      let failure = null;
      search: for (let head = 0; head < queue.length && head < 100000; head++) {
        for (const direction of DIRECTIONS) {
          const state = step(level, queue[head].state, direction);
          const path = [...queue[head].path, direction];
          if (state.status === 'lost') { failure = path; break search; }
          const key = stateKey(state);
          if (state.status === 'playing' && !seen.has(key)) {
            seen.add(key); queue.push({ state, path });
          }
        }
      }
      if (!failure) throw new Error('No reachable loss found');
      console.log(JSON.stringify({
        levels: LEVELS.map(({ id, name, solution, optimalMoves }) => ({ id, name, solution, optimalMoves })),
        failure,
      }));
    """
    return json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e", source], cwd=GAME_DIR, text=True,
    ))


def ready(page):
    expect(page.locator("#game-root")).to_have_attribute("data-busy", "false")


def moves(page, count):
    expect(page.locator("#moves")).to_have_text(str(count).zfill(2))


def select_level(page, index):
    page.locator(f'#level-nav [data-level="{index}"]').click()
    expect(page.locator("#game-root")).to_have_attribute("data-level", str(index))
    ready(page)
    moves(page, 0)


def press(page, direction, *, button=False):
    ready(page)
    if button:
        page.locator(f'[data-dir="{direction}"]').click()
        page.mouse.move(1, 1)
    else:
        page.keyboard.press(KEYS[direction])
    ready(page)


def screenshot(page, name):
    page.mouse.move(1, 1)
    page.screenshot(path=str(ARTIFACTS / name), full_page=True, animations="disabled")
    return str(ARTIFACTS / name)


def watch(page, errors):
    page.on("pageerror", lambda error: errors.append({"type": "pageerror", "message": str(error)}))
    page.on("console", lambda message: errors.append({"type": "console", "message": message.text}) if message.type == "error" else None)
    page.on("requestfailed", lambda request: errors.append({"type": "requestfailed", "url": request.url, "message": request.failure}))
    page.on("response", lambda response: errors.append({"type": "http", "status": response.status, "url": response.url}) if response.url.startswith(ORIGIN.rstrip("/")) and response.status >= 400 else None)


def regression_checks(browser, report):
    context = browser.new_context(viewport={"width": 1440, "height": 1120})
    page = context.new_page()
    watch(page, report["errors"])
    page.goto(ORIGIN, wait_until="networkidle")
    ready(page)

    # Trigger all three public controls within the same JS task so the 220 ms
    # animation cannot expire between pointer events on a slow CI machine.
    queued = page.evaluate("""() => {
      document.querySelector('[data-dir="right"]').click();
      document.querySelector('[data-dir="down"]').click();
      const before = { busy: document.querySelector('#game-root').dataset.busy, moves: document.querySelector('#moves').textContent };
      document.querySelector('#preview-toggle').click();
      return before;
    }""")
    assert queued == {"busy": "true", "moves": "01"}, queued
    expect(page.locator("#preview-toggle")).to_have_attribute("aria-pressed", "true")
    ready(page)
    page.wait_for_timeout(500)  # Must outlive the cancelled animation callback.
    moves(page, 1)
    page.locator('[data-dir="down"]').click()
    moves(page, 1)
    page.locator("#commit-preview").click()
    ready(page)
    moves(page, 2)
    report["checks"].append("enabling preview cancels a queued direction; it never commits after the animation window")

    # The harness supplies a valid async Host with a manually released write.
    # Only the Host lifecycle is controlled; progress originates in a nav click.
    await_setup = """async () => {
      const { gameDefinition } = await import('./game.mjs');
      const root = document.createElement('div');
      root.id = 'host-regression';
      document.body.append(root);
      let record = null;
      const probe = window.__hostProbe = { root, reads: 0, writes: 0, releases: [], disposeDone: false, remountDone: false };
      const host = probe.host = {
        session: { gameId: 'tiny-signals', gameVersion: '0.1.0', releaseChannel: 'development', adAuthority: 'none', sessionId: 'browser-regression', locale: 'zh-CN', capabilities: ['storage'] },
        storage: {
          async read() { probe.reads++; return record; },
          async write(key, value) {
            probe.writes++;
            await new Promise(resolve => probe.releases.push(resolve));
            record = { value: structuredClone(value), version: String(probe.writes) };
            return record;
          },
        },
      };
      probe.definition = gameDefinition;
      probe.instance = await gameDefinition.mount(root, host);
    }"""
    page.evaluate(await_setup)
    page.locator('#host-regression #level-nav [data-level="1"]').click()
    page.wait_for_function("window.__hostProbe.writes === 1")
    page.evaluate("() => { const p = window.__hostProbe; p.disposal = p.instance.dispose().then(() => { p.disposeDone = true; }); }")
    page.wait_for_timeout(100)
    assert page.evaluate("window.__hostProbe.disposeDone") is False
    page.evaluate("() => window.__hostProbe.releases.shift()()")
    page.wait_for_function("window.__hostProbe.disposeDone")
    page.evaluate("async () => { const p = window.__hostProbe; p.instance = await p.definition.mount(p.root, p.host); }")
    expect(page.locator("#host-regression")).to_have_attribute("data-level", "1")

    # mount() also promises to dispose an earlier instance on the same target.
    page.locator('#host-regression #level-nav [data-level="2"]').click()
    page.wait_for_function("window.__hostProbe.writes === 2")
    page.evaluate("() => { const p = window.__hostProbe; p.remount = p.definition.mount(p.root, p.host).then(instance => { p.instance = instance; p.remountDone = true; }); }")
    page.wait_for_timeout(100)
    host_waiting = page.evaluate("({done: window.__hostProbe.remountDone, reads: window.__hostProbe.reads})")
    assert host_waiting == {"done": False, "reads": 2}, host_waiting
    page.evaluate("() => window.__hostProbe.releases.shift()()")
    page.wait_for_function("window.__hostProbe.remountDone")
    expect(page.locator("#host-regression")).to_have_attribute("data-level", "2")
    page.evaluate("async () => { const p = window.__hostProbe; await p.instance.dispose(); p.root.remove(); delete window.__hostProbe; }")
    report["checks"].append("async Host: dispose waits for its pending write; automatic remount reads only after the old save completes")
    context.close()

    # Playwright normally disables BFCache. The browser launch explicitly leaves
    # it enabled, and this independent context observes native pageshow events.
    bfcache = browser.new_context(viewport={"width": 1440, "height": 1120})
    history_page = bfcache.new_page()
    watch(history_page, report["errors"])
    history_page.add_init_script("""window.__pageShowEvents = []; addEventListener('pageshow', event => window.__pageShowEvents.push({ persisted: event.persisted }));""")
    history_page.goto(ORIGIN, wait_until="networkidle")
    ready(history_page)
    press(history_page, "right")
    moves(history_page, 1)
    history_page.goto(ORIGIN.rstrip("/") + "/?browser-check-away=1", wait_until="networkidle")
    history_page.go_back(wait_until="commit")
    history_page.wait_for_function("window.__pageShowEvents?.length > 0")
    lifecycle = history_page.evaluate("({ restored: window.__pageShowEvents.some(event => event.persisted), notRestored: performance.getEntriesByType('navigation')[0]?.notRestoredReasons?.toJSON?.() ?? null })")
    ready(history_page)
    if lifecycle["restored"]:
        moves(history_page, 1)
        press(history_page, "up")
        moves(history_page, 2)
        report["checks"].append("native BFCache pageshow.persisted return preserves the live game and accepts the next direction")
    else:
        # Cache admission depends on Chromium's execution environment. Report
        # skipped native coverage explicitly instead of claiming a synthetic pass.
        report["checks"].append({"native_bfcache": "not exercised: Chromium restored by loading a new document", "details": lifecycle})
    bfcache.close()


def save_report(report, filename):
    report["passed"] = not report["errors"]
    report["summary"] = {"check_groups": len(report["checks"]), "level_wins": len(report["levels"]), "errors": len(report["errors"])}
    (ARTIFACTS / filename).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["errors"]:
        raise SystemExit(1)


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    fixtures = load_fixtures()
    report = {"origin": ORIGIN, "checks": [], "levels": [], "screenshots": [], "errors": []}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"], ignore_default_args=["--disable-back-forward-cache"])
        regression_checks(browser, report)
        if REGRESSIONS_ONLY:
            browser.close()
            save_report(report, "browser-regression-report.json")
            return
        context = browser.new_context(viewport={"width": 1440, "height": 1120}, device_scale_factor=1)
        page = context.new_page()
        watch(page, report["errors"])
        page.goto(ORIGIN, wait_until="networkidle")
        ready(page)
        moves(page, 0)
        expect(page.locator("#boards .island")).to_have_count(4)
        expect(page.locator("#level-nav button")).to_have_count(6)
        report["screenshots"].append(screenshot(page, "desktop.png"))

        # Mixed keyboard and pointer inputs exercise all six real win paths.
        for index, level in enumerate(fixtures["levels"]):
            select_level(page, index)
            descriptions = page.locator("#boards svg > desc").all_text_contents()
            assert len(descriptions) == 4
            mechanism = ["单向门", "罗盘", "折叶桥", "风场", "灯箱", "残影"][index]
            for description in descriptions:
                assert "墙位于" in description and mechanism in description, {"level": index, "description": description}
            expect(page.locator("#optimal-score")).to_have_text(f'{level["optimalMoves"]} 步')
            for turn, direction in enumerate(level["solution"], 1):
                press(page, direction, button=(turn % 3 == 0))
                moves(page, turn)
            expect(page.locator("#game-root")).to_have_attribute("data-status", "won")
            expect(page.locator("#home-count")).to_have_text("4 / 4")
            expect(page.locator("#result-copy")).to_contain_text("最优星")
            expect(page.locator(f'#level-nav [data-level="{index}"] .level-award')).to_have_text("★")
            expect(page.locator("#personal-best")).to_have_text(f'{level["optimalMoves"]} 步')
            report["levels"].append({"id": level["id"], "name": level["name"], "status": "won", "moves": level["optimalMoves"], "star": True})
        report["screenshots"].append(screenshot(page, "victory.png"))
        expect(page.locator("#completion-count")).to_have_text("6 / 6")
        report["checks"].append("all 24 board SVG descriptions identify walls and the relevant mechanism")

        # Await async host storage and verify reload actually reconstructs it.
        page.wait_for_function("key => Object.keys(JSON.parse(localStorage.getItem(key) || '{}').value?.levels || {}).length === 6", arg=SAVE_KEY)
        saved = page.evaluate("key => JSON.parse(localStorage.getItem(key)).value", SAVE_KEY)
        assert saved["lastLevel"] == 5
        for level in fixtures["levels"]:
            assert saved["levels"][level["id"]] == {"best": level["optimalMoves"], "bestUnaided": level["optimalMoves"]}
        page.reload(wait_until="networkidle")
        ready(page)
        expect(page.locator("#game-root")).to_have_attribute("data-level", "5")
        expect(page.locator("#completion-count")).to_have_text("6 / 6")
        expect(page.locator("#level-nav .level-award")).to_have_text(["★"] * 6)
        report["checks"].append("six optimal wins, stars, personal bests and persistence after reload")

        # A real reachable failure must allow reversal of the last complete turn.
        for direction in fixtures["failure"]:
            press(page, direction)
        expect(page.locator("#game-root")).to_have_attribute("data-status", "lost")
        moves(page, len(fixtures["failure"]))
        expect(page.locator("#result")).to_be_visible()
        page.locator("#undo").click()
        ready(page)
        expect(page.locator("#game-root")).to_have_attribute("data-status", "playing")
        moves(page, len(fixtures["failure"]) - 1)
        press(page, fixtures["failure"][-1])
        expect(page.locator("#game-root")).to_have_attribute("data-status", "lost")
        page.locator("#restart").click()
        ready(page)
        moves(page, 0)
        expect(page.locator("#game-root")).to_have_attribute("data-status", "playing")
        expect(page.locator("#undo")).to_be_disabled()
        report["checks"].append({"failure_undo_replay_restart": fixtures["failure"]})

        # A modal must block gameplay shortcuts, including undo and restart.
        select_level(page, 0)
        press(page, "right")
        page.locator("#help").click()
        expect(page.locator("#rules-dialog")).to_be_visible()
        for key in ["ArrowDown", "w", "z", "r"]:
            page.keyboard.press(key)
        moves(page, 1)
        page.locator("#close-help").click()
        expect(page.locator("#rules-dialog")).not_to_be_visible()
        press(page, "up")
        moves(page, 2)
        page.keyboard.press("z")
        moves(page, 1)
        page.keyboard.press("r")
        moves(page, 0)
        report["checks"].append("rules dialog blocks input; keyboard undo and restart work after closing")

        # Desktop preview changes no turn until explicitly confirmed.
        page.locator("#preview-toggle").click()
        page.locator('[data-dir="right"]').click()
        moves(page, 0)
        expect(page.locator("#commit-preview")).to_be_visible()
        page.locator("#commit-preview").click()
        ready(page)
        moves(page, 1)
        page.locator("#preview-toggle").click()
        report["checks"].append("desktop preview requires explicit confirmation")

        # In wind level, down then preview-up moves moon 19 -> 13 -> 14.
        # The rendered preview must include the intermediate turn, not a diagonal.
        select_level(page, 3)
        press(page, "down")
        page.locator("#preview-toggle").click()
        page.locator('[data-dir="up"]').click()
        moves(page, 1)
        preview_path = page.locator('.island[data-board="1"] [data-piece="move-preview"] path').get_attribute("d")
        coordinates = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", preview_path)]
        assert preview_path.count("L") == 2 and len(coordinates) == 6, preview_path
        x1, y1, x2, y2, x3, y3 = coordinates
        assert x1 == x2 and y1 != y2 and x2 != x3 and y2 == y3, preview_path
        page.locator("#commit-preview").click()
        ready(page)
        moves(page, 2)
        expect(page.locator('.island[data-board="1"] [data-piece="robot"]')).to_have_attribute("data-cell", "14")
        page.locator("#preview-toggle").click()
        report["checks"].append("wind preview draws both orthogonal movement segments and confirms the predicted landing cell")

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        mobile_page = mobile.new_page()
        watch(mobile_page, report["errors"])
        mobile_page.goto(ORIGIN, wait_until="networkidle")
        ready(mobile_page)
        mobile_page.locator("#preview-toggle").tap()
        mobile_page.locator('[data-dir="right"]').tap()
        moves(mobile_page, 0)
        expect(mobile_page.locator("#preview-toggle")).to_have_attribute("aria-pressed", "true")
        expect(mobile_page.locator("#commit-preview")).to_be_visible()
        mobile_page.locator("#commit-preview").tap()
        ready(mobile_page)
        moves(mobile_page, 1)
        mobile_page.locator("#undo").tap()
        moves(mobile_page, 0)
        mobile_page.locator("#preview-toggle").tap()
        mobile_page.locator('[data-dir="right"]').tap()
        ready(mobile_page)
        moves(mobile_page, 1)
        mobile_page.locator("#restart").tap()
        moves(mobile_page, 0)
        mobile_page.locator("#hint").tap()
        expect(mobile_page.locator("#hint-panel")).to_be_visible()
        expect(mobile_page.locator("#hint-route")).to_contain_text("→")
        mobile_page.locator("#hint").tap()
        mobile_page.evaluate("window.scrollTo(0, 0)")
        viewport = mobile_page.evaluate("({width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth})")
        assert viewport["width"] == 390, viewport
        assert viewport["document"] <= 390 and viewport["body"] <= 390, viewport
        for selector in [".board-grid", ".control-panel", "#level-nav"]:
            box = mobile_page.locator(selector).bounding_box()
            assert box and box["x"] >= -1 and box["x"] + box["width"] <= 391, {selector: box}
        report["screenshots"].append(screenshot(mobile_page, "mobile.png"))
        report["checks"].append({"mobile_390x844": "touch preview, commit, undo, restart, hint; no horizontal overflow", "viewport": viewport})
        mobile.close()
        context.close()
        browser.close()

    save_report(report, "browser-report.json")


if __name__ == "__main__":
    main()
