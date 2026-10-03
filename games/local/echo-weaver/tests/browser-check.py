#!/usr/bin/env python3
"""Exercise the grid game in Chromium through public pointer/touch controls.

`npm run test:browser` builds and serves the game. Python Playwright and Chromium
are required; BROWSER_EXECUTABLE may select a browser. No check injects a puzzle
state or calls a game action: authored solutions only supply expected UI moves.
"""

import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

from playwright.sync_api import sync_playwright, expect


ORIGIN = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4413/"
ARTIFACTS = Path(os.environ.get("ECHO_WEAVER_ARTIFACTS", str(Path(tempfile.gettempdir()) / "echo-weaver-v2")))
ERRORS = []
CHECKS = []


def checkpoint(message):
    CHECKS.append(message)
    print("PASS:", message, flush=True)


def snapshot(page):
    return page.evaluate("window.__echoWeaverSnapshot()")


def phase(page, value):
    page.wait_for_function("value => window.__echoWeaverSnapshot?.().phase === value", arg=value, timeout=45000)
    return snapshot(page)


def watch(page, label):
    page.on("pageerror", lambda error: ERRORS.append(f"{label}: {error}"))
    page.on("console", lambda message: ERRORS.append(f"{label}: {message.text}") if message.type == "error" else None)
    page.on("requestfailed", lambda request: ERRORS.append(f"{label}: {request.url}: {request.failure}"))
    page.on("response", lambda response: ERRORS.append(f"{label}: HTTP {response.status} {response.url}") if response.url.startswith(ORIGIN.rstrip("/")) and response.status >= 400 else None)


def open_game(context, label):
    page = context.new_page()
    page.set_default_timeout(10000)
    watch(page, label)
    page.goto(ORIGIN, wait_until="networkidle")
    page.wait_for_function("typeof window.__echoWeaverSnapshot === 'function'")
    if page.locator("#help-dialog").is_visible():
        page.locator("#close-help").click()
    phase(page, "ready")
    return page


def fixtures(page):
    return page.evaluate("""async () => {
      const { LEVELS } = await import('./levels.mjs');
      const { createState, simulate } = await import('./engine.mjs');
      const { PROGRESS_KEY, readProgress } = await import('./progress.mjs');
      return LEVELS.map(level => {
        const initial = createState(level);
        const poses = new Map(level.solution.map(piece => [piece.id, piece]));
        const solution = { pieces: initial.pieces.map(piece => ({
          ...piece, x: null, y: null, ...poses.get(piece.id)
        })) };
        return { id: level.id, initial, solution, report: simulate(level, solution),
          initialReport: simulate(level, initial), targets: level.targets,
          tickMs: level.beatMs / level.ticksPerBeat,
          progressKey: PROGRESS_KEY, progressVersion: readProgress(null, LEVELS).version };
      });
    }""")


def press(page, selector, touch=False):
    locator = page.locator(selector)
    if touch:
        locator.tap()
        # Touch activation settles after touchend so its native compatibility
        # click can be deduplicated. Observe the next rendered frame, rather
        # than asserting midway through that same input task.
        page.evaluate("() => new Promise(resolve => requestAnimationFrame(resolve))")
    else:
        locator.click()


def piece_selector(piece_id, inventory=False):
    return f'{"#inventory" if inventory else "#board"} button[data-piece="{piece_id}"]'


def cell_selector(x, y):
    return f'#board button.cell[data-x="{x}"][data-y="{y}"]'


def get_piece(page, piece_id):
    return next(piece for piece in snapshot(page)["state"]["pieces"] if piece["id"] == piece_id)


def select_piece(page, piece_id, touch=False):
    if snapshot(page)["selectedPiece"] != piece_id:
        piece = get_piece(page, piece_id)
        press(page, piece_selector(piece_id, inventory=piece["x"] is None), touch)
    assert snapshot(page)["selectedPiece"] == piece_id


def dismiss_result(page, touch=False):
    if page.locator("#result").is_visible():
        press(page, "#result-close", touch)
    expect(page.locator("#result")).not_to_be_visible()
    assert snapshot(page)["phase"] in ("ready", "result")


def select_level(page, index, fixture, touch=False):
    dismiss_result(page, touch)
    press(page, f'#level-nav [data-level="{index}"]', touch)
    current = phase(page, "ready")
    assert current["levelIndex"] == index, current
    assert current["levelId"] == fixture["id"], current
    assert current["state"] == fixture["initial"], current
    assert current["report"] is None, "Changing level must not simulate a preview"
    return current


def solve_with_controls(page, fixture, touch=False):
    # Return movable pieces first so the authored layout never conflicts with a
    # different initial arrangement. Every move still uses the real controls.
    for piece in snapshot(page)["state"]["pieces"]:
        if piece["x"] is not None:
            select_piece(page, piece["id"], touch)
            press(page, "#return-piece", touch)
            assert get_piece(page, piece["id"])["x"] is None
    for desired in fixture["solution"]["pieces"]:
        select_piece(page, desired["id"], touch)
        if desired["x"] is not None:
            before = snapshot(page)
            press(page, cell_selector(desired["x"], desired["y"]), touch)
            after = snapshot(page)
            assert after["historyLength"] == before["historyLength"] + 1
            assert get_piece(page, desired["id"])["x"] == desired["x"]
            assert get_piece(page, desired["id"])["y"] == desired["y"]
        for _ in range(4):
            if get_piece(page, desired["id"]).get("orientation") == desired.get("orientation"):
                break
            press(page, "#rotate", touch)
        assert get_piece(page, desired["id"]).get("orientation") == desired.get("orientation")
    assert snapshot(page)["state"] == fixture["solution"]
    assert snapshot(page)["report"] is None, "Editing must not reveal predicted arrivals"
    expect(page.locator("#trace-layer .trace-segment")).to_have_count(0)


def emit_and_finish(page, expected, touch=False):
    press(page, "#emit", touch)
    started = phase(page, "running")
    assert started["report"] == expected
    phase(page, "result")
    if expected["won"]:
        expect(page.locator("#result")).to_be_visible()
    else:
        expect(page.locator("#result")).not_to_be_visible()
    completed = snapshot(page)
    assert completed["report"] == expected
    assert completed["elapsed"] >= expected["duration"]
    for index, result in enumerate(expected["targetResults"]):
        expect(page.locator(".beat-light").nth(index)).to_have_attribute("data-status", result["status"])
    return completed


def no_overflow(page, label):
    dimensions = page.evaluate("""() => ({ viewport: innerWidth,
      html: document.documentElement.scrollWidth, body: document.body.scrollWidth })""")
    assert max(dimensions["html"], dimensions["body"]) <= dimensions["viewport"] + 1, f"{label}: {dimensions}"


def control_geometry(page, label):
    controls = page.locator("#board button.cell, #inventory button[data-piece]").evaluate_all("""elements => elements
      .filter(element => !element.disabled && getComputedStyle(element).display !== 'none')
      .map(element => {
        const box = element.getBoundingClientRect();
        return {id: element.dataset.piece || `${element.dataset.x},${element.dataset.y}`,
          grid: element.classList.contains('cell'), x: box.x, y: box.y,
          right: box.right, bottom: box.bottom, width: box.width, height: box.height};
      })""")
    assert controls, f"{label}: no board controls"
    for control in controls:
        minimum = 30 if control["grid"] else 36
        assert control["width"] >= minimum and control["height"] >= minimum, f"{label}: target too small {control}"
        assert control["x"] >= -1 and control["right"] <= page.viewport_size["width"] + 1, f"{label}: offscreen {control}"
    for index, first in enumerate(controls):
        for second in controls[index + 1:]:
            separated = first["right"] <= second["x"] + .1 or second["right"] <= first["x"] + .1 or first["bottom"] <= second["y"] + .1 or second["bottom"] <= first["y"] + .1
            assert separated, f"{label}: overlapping controls {first['id']} / {second['id']}"


def screenshot(page, name):
    page.screenshot(path=str(ARTIFACTS / f"{name}.png"), full_page=True, animations="disabled")


def verify_pause_icon(page):
    expect(page.locator("#pause")).to_have_attribute("aria-label", "暂停")
    bars = page.locator("#pause svg rect").evaluate_all("""elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return {x: box.x, y: box.y, width: box.width, height: box.height,
        fill: getComputedStyle(element).fill};
    })""")
    assert len(bars) == 2, bars
    left, right = sorted(bars, key=lambda bar: bar["x"])
    assert left["width"] > 0 and left["height"] > left["width"], bars
    assert abs(left["width"] - right["width"]) < .01 and abs(left["height"] - right["height"]) < .01, bars
    assert abs(left["y"] - right["y"]) < .01 and left["x"] + left["width"] < right["x"], bars
    assert all(bar["fill"] not in ("none", "rgba(0, 0, 0, 0)") for bar in bars), bars


def center(locator):
    locator.scroll_into_view_if_needed()
    box = locator.bounding_box()
    assert box, "Drag endpoint is not rendered"
    return (box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


def drag(page, source, target, touch=False, cancel=False):
    # Arrange a common viewport before touchStart: scrolling during a drag would
    # itself test browser panning, instead of the game's continuous pointer path.
    page.locator("#board").scroll_into_view_if_needed()
    end = center(page.locator(target))
    start = center(page.locator(source))
    end = center(page.locator(target))
    start_box = page.locator(source).bounding_box()
    start = (start_box["x"] + start_box["width"] / 2, start_box["y"] + start_box["height"] / 2)
    if touch:
        cdp = page.context.new_cdp_session(page)
        def point(x, y):
            return {"x": x, "y": y, "radiusX": 2, "radiusY": 2, "force": 1, "id": 1}
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point(*start)]})
        for step in range(1, 9):
            x = start[0] + (end[0] - start[0]) * step / 8
            y = start[1] + (end[1] - start[1]) * step / 8
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [point(x, y)]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchCancel" if cancel else "touchEnd", "touchPoints": []})
        cdp.detach()
    else:
        page.mouse.move(*start)
        page.mouse.down()
        page.mouse.move(*end, steps=8)
        if cancel:
            # Browsers expose native touch cancellation through CDP; a mouse has
            # no native cancel command, so dispatch its standardized cancel event
            # after native mouse down/move to exercise the same rollback handler.
            page.locator(source).dispatch_event("pointercancel", {"pointerId": 1, "pointerType": "mouse", "bubbles": True})
        page.mouse.up()
    page.wait_for_timeout(80)


def drag_checks(page, fixture, touch=False):
    solve_with_controls(page, fixture, touch)
    pieces = [piece for piece in snapshot(page)["state"]["pieces"] if piece["x"] is not None]
    movable = pieces[0]
    empty = page.locator('#board button.cell:not([data-piece]):not(:disabled)').evaluate_all("""elements => elements
      .filter(element => !element.dataset.fixed && !element.dataset.source && !element.dataset.receiver)
      .map(element => ({x: Number(element.dataset.x), y: Number(element.dataset.y)}))""")
    # The engine rejects source/fixed cells as drops. Use a free cell identified
    # by the public cell's accessible drop state, if provided.
    destination = None
    before = snapshot(page)
    for candidate in empty:
        drag(page, piece_selector(movable["id"]), cell_selector(candidate["x"], candidate["y"]), touch)
        if snapshot(page)["state"] != before["state"]:
            destination = candidate
            break
    assert destination, "No empty grid cell accepted a drag"
    moved = get_piece(page, movable["id"])
    assert (moved["x"], moved["y"]) == (destination["x"], destination["y"])
    assert moved["orientation"] == movable["orientation"], "Dragging also rotated a piece"
    assert snapshot(page)["historyLength"] == before["historyLength"] + 1
    press(page, "#undo", touch)
    assert snapshot(page)["state"] == before["state"]

    before = snapshot(page)
    drag(page, piece_selector(movable["id"]), cell_selector(destination["x"], destination["y"]), touch, cancel=True)
    assert snapshot(page)["state"] == before["state"], "Cancelled drag changed layout"
    assert snapshot(page)["historyLength"] == before["historyLength"], "Cancelled drag created an undo entry"

    occupied = pieces[1]
    drag(page, piece_selector(movable["id"]), piece_selector(occupied["id"]), touch)
    assert snapshot(page)["state"] == before["state"], "Occupied drop overwrote another piece"
    assert snapshot(page)["historyLength"] == before["historyLength"]

    # Return through the visible control, then drag from the tray into its old
    # square. This verifies that inventory and board share pointer semantics.
    select_piece(page, movable["id"], touch)
    press(page, "#return-piece", touch)
    tray_state = snapshot(page)
    drag(page, piece_selector(movable["id"], inventory=True), cell_selector(movable["x"], movable["y"]), touch)
    assert snapshot(page)["state"] == before["state"]
    assert snapshot(page)["historyLength"] == tray_state["historyLength"] + 1
    before_return = snapshot(page)
    drag(page, piece_selector(movable["id"]), "#inventory", touch)
    assert get_piece(page, movable["id"])["x"] is None, "Dropping onto the tray did not return a piece"
    assert snapshot(page)["historyLength"] == before_return["historyLength"] + 1
    press(page, "#undo", touch)
    assert snapshot(page)["state"] == before_return["state"]
    checkpoint(f"{'Native touch' if touch else 'Mouse'} drag moves board/tray pieces; cancel and occupied drops roll back without history")


def desktop_checks(browser):
    context = browser.new_context(viewport={"width": 1440, "height": 1100}, locale="zh-CN")
    page = open_game(context, "desktop")
    data = fixtures(page)
    assert len(data) == 5, "The redesign is a five-puzzle playability slice"
    assert all(item["report"]["won"] for item in data), "Authored UI fixtures must win"
    assert not any(item["initialReport"]["won"] for item in data)
    assert snapshot(page)["report"] is None
    expect(page.locator("#trace-layer .trace-segment")).to_have_count(0)
    screenshot(page, "desktop-initial")
    no_overflow(page, "desktop")

    connected_index = next(index for index, item in enumerate(data)
        if len(item["initialReport"]["arrivals"]) == len(item["targets"]) >= 2
        and not item["initialReport"]["won"]
        and any(arrival["tick"] not in item["targets"] for arrival in item["initialReport"]["arrivals"]))
    select_level(page, connected_index, data[connected_index])
    failed = emit_and_finish(page, data[connected_index]["initialReport"])
    assert not failed["report"]["won"]
    assert failed["report"]["arrivals"], "A real connected route must fail on its timing"
    screenshot(page, "desktop-connected-wrong-time")
    page.locator(".workbench").screenshot(path=str(ARTIFACTS / "workbench-shared-wait.png"))
    expect(page.locator("#result")).not_to_be_visible()
    checkpoint("connected paths reach the receiver but fail on timing; failure stays inline so editing can continue")

    select_level(page, len(data) - 1, data[-1])
    weakened = emit_and_finish(page, data[-1]["initialReport"])
    assert any(failure["reason"] == "weak" for failure in weakened["report"]["failures"])
    expect(page.locator("#trace-layer .failure-marker")).not_to_have_count(0)
    assert len(weakened["report"]["arrivals"]) < len(data[-1]["targets"])
    screenshot(page, "desktop-energy-failure")
    checkpoint("an exhausted branch stops at the absorber, leaves a visible failure marker, and cannot light its target")

    select_level(page, 0, data[0])
    solve_with_controls(page, data[0])
    solved = snapshot(page)
    mirror = next(piece for piece in solved["state"]["pieces"] if piece["type"] == "mirror" and piece["x"] is not None)
    select_piece(page, mirror["id"])
    before = snapshot(page)
    press(page, piece_selector(mirror["id"]))
    assert get_piece(page, mirror["id"])["orientation"] != mirror["orientation"]
    assert snapshot(page)["historyLength"] == before["historyLength"] + 1
    press(page, "#undo")
    assert snapshot(page)["state"] == solved["state"]
    assert snapshot(page)["historyLength"] == before["historyLength"]
    press(page, "#restart")
    assert snapshot(page)["state"] == data[0]["initial"]
    assert snapshot(page)["historyLength"] == 0
    assert snapshot(page)["report"] is None
    checkpoint("direct piece rotation, exact undo and reset work without revealing predicted routes")

    drag_checks(page, data[0])
    select_level(page, 0, data[0])
    solve_with_controls(page, data[0])
    press(page, "#emit")
    phase(page, "running")
    page.wait_for_timeout(200)
    assert snapshot(page)["elapsed"] > 0
    pulses = page.locator('#trace-layer circle.pulse[data-pulse]')
    assert pulses.count() > 0, "No travelling pulse rendered"
    first_positions = pulses.evaluate_all("elements => elements.map(e => [e.dataset.pulse, e.getAttribute('cx'), e.getAttribute('cy'), e.getAttribute('opacity')])")
    page.wait_for_timeout(150)
    second_positions = pulses.evaluate_all("elements => elements.map(e => [e.dataset.pulse, e.getAttribute('cx'), e.getAttribute('cy'), e.getAttribute('opacity')])")
    assert first_positions != second_positions, "Wave positions did not advance along traced cells"
    expect(page.locator("#trace-layer .trace-segment").first).to_be_attached()
    verify_pause_icon(page)
    screenshot(page, "desktop-wave-in-flight")
    press(page, "#pause")
    paused = phase(page, "paused")
    page.wait_for_timeout(250)
    assert snapshot(page)["elapsed"] == paused["elapsed"], "Paused clock advanced"
    press(page, "#help")
    expect(page.locator("#help-dialog")).to_be_visible()
    press(page, "#close-help")
    assert snapshot(page)["phase"] == "paused"
    press(page, "#pause")
    phase(page, "running")
    page.wait_for_timeout(150)
    assert snapshot(page)["elapsed"] > paused["elapsed"]
    press(page, "#emit")
    phase(page, "ready")
    page.wait_for_timeout(200)
    assert snapshot(page)["phase"] == "ready", "A cancelled animation opened a stale result"
    checkpoint("traced waves visibly travel; pause/help freeze simulation; solid pause bars render; stop cancels callbacks")

    press(page, "#slow")
    expect(page.locator("#slow")).to_have_attribute("aria-pressed", "true")
    press(page, "#emit")
    phase(page, "running")
    start = snapshot(page)["elapsed"]
    page.wait_for_timeout(400)
    slow_delta = snapshot(page)["elapsed"] - start
    press(page, "#pause")
    phase(page, "paused")
    press(page, "#slow")
    expect(page.locator("#slow")).to_have_attribute("aria-pressed", "false")
    press(page, "#pause")
    phase(page, "running")
    start = snapshot(page)["elapsed"]
    page.wait_for_timeout(400)
    normal_delta = snapshot(page)["elapsed"] - start
    assert .25 < slow_delta / normal_delta < .8, (slow_delta, normal_delta)
    phase(page, "result")
    dismiss_result(page)
    press(page, "#replay")
    phase(page, "running")
    assert snapshot(page)["report"] == data[0]["report"]
    phase(page, "result")
    dismiss_result(page)
    select_piece(page, mirror["id"])
    press(page, "#rotate")
    assert snapshot(page)["report"] is None, "Editing retained an obsolete result"
    expect(page.locator("#trace-layer .trace-segment")).to_have_count(0)
    expect(page.locator("#replay")).to_be_disabled()
    checkpoint("half-speed slows the internal clock, replay preserves the experiment, and edits clear obsolete traces/results")

    # The entire playable slice must be completable with audio disabled.
    expect(page.locator("#sound")).to_have_attribute("aria-pressed", "false")
    press(page, "#sound")
    expect(page.locator("#sound")).to_have_attribute("aria-pressed", "true")
    press(page, "#sound")
    expect(page.locator("#sound")).to_have_attribute("aria-pressed", "false")
    for index, fixture in enumerate(data):
        select_level(page, index, fixture)
        solve_with_controls(page, fixture)
        control_geometry(page, f"desktop puzzle {index + 1}")
        result = emit_and_finish(page, fixture["report"])
        assert result["report"]["won"]
        assert [arrival["tick"] for arrival in result["report"]["arrivals"] if arrival["matched"]] == fixture["targets"]
        if index == len(data) - 1:
            screenshot(page, "desktop-campaign-complete")
        if index == 2:
            dismiss_result(page)
            page.locator(".workbench").screenshot(path=str(ARTIFACTS / "workbench-built.png"))
        print(f"  Desktop puzzle {index + 1}: arrivals {fixture['targets']}; won muted", flush=True)
        if index < len(data) - 1:
            if index == 2:
                select_level(page, index + 1, data[index + 1])
            else:
                press(page, "#continue")
            advanced = phase(page, "ready")
            assert advanced["levelIndex"] == index + 1
            assert advanced["state"] == data[index + 1]["initial"]
    checkpoint("all five puzzles win through real placement and rotation controls, with exact target ticks and muted audio")

    dismiss_result(page)
    press(page, "#language")
    expect(page.locator("html")).to_have_attribute("lang", "en")
    saved = snapshot(page)["progress"]
    assert set(saved["completed"]) == {fixture["id"] for fixture in data}
    page.reload(wait_until="networkidle")
    phase(page, "ready")
    restored = snapshot(page)
    assert restored["levelIndex"] == len(data) - 1
    assert restored["progress"] == saved
    assert restored["report"] is None
    expect(page.locator("html")).to_have_attribute("lang", "en")
    expect(page.locator("#sound")).to_have_attribute("aria-pressed", "false")
    screenshot(page, "desktop-english")
    checkpoint("new puzzle IDs, selected puzzle, English and mute persist after a complete campaign and reload")
    context.close()
    return data


def mobile_checks(browser, data):
    context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2, locale="zh-CN")
    page = open_game(context, "mobile")
    screenshot(page, "mobile-390-initial")
    no_overflow(page, "390px portrait")
    drag_checks(page, data[0], touch=True)
    for index, fixture in enumerate(data):
        select_level(page, index, fixture, touch=True)
        control_geometry(page, f"390px puzzle {index + 1}")
        solve_with_controls(page, fixture, touch=True)
        emit_and_finish(page, fixture["report"], touch=True)
        if index == len(data) - 1:
            screenshot(page, "mobile-390-win")
        print(f"  Touch puzzle {index + 1}: arrivals {fixture['targets']}; won", flush=True)
    checkpoint("all five puzzles finish using real touch taps at 390px")

    for width, height, label in [(320, 844, "320-portrait"), (844, 390, "844-landscape")]:
        page.set_viewport_size({"width": width, "height": height})
        select_level(page, len(data) - 1, data[-1], touch=True)
        no_overflow(page, label)
        control_geometry(page, label)
        solve_with_controls(page, data[-1], touch=True)
        screenshot(page, f"mobile-{label}")
        emit_and_finish(page, data[-1]["report"], touch=True)
    checkpoint("320px portrait and 844px landscape have no horizontal overflow or overlapping board/tray targets and remain touch playable")
    context.close()


def storage_checks(browser, data):
    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
    context.add_init_script("""Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage blocked by browser regression test', 'SecurityError'); }
    });""")
    page = open_game(context, "blocked-storage")
    solve_with_controls(page, data[0])
    emit_and_finish(page, data[0]["report"])
    context.close()
    checkpoint("blocked browser storage does not prevent a complete puzzle")

    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
    context.add_init_script("""localStorage.setItem('echo-weaver-progress-v1', JSON.stringify({
      version: 1, selected: 7, completed: {'the-long-way': {attempts: 1}, 'room-for-three': {attempts: 2}},
      sound: false, locale: 'en'
    }));""")
    page = open_game(context, "legacy-storage")
    current = snapshot(page)
    assert current["levelIndex"] == 0
    assert not current["progress"]["completed"], "Old selector-puzzle IDs marked redesigned puzzles as complete"
    context.close()
    checkpoint("legacy selector-puzzle progress cannot mark redesigned grid puzzles complete")

    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
    stale = {"version": data[0]["progressVersion"], "selected": 7,
        "completed": {"the-long-way": {"attempts": 1}}, "sound": False, "locale": "en"}
    context.add_init_script(f"localStorage.setItem({json.dumps(data[0]['progressKey'])}, JSON.stringify({json.dumps(stale)}));")
    page = open_game(context, "unknown-puzzle-storage")
    current = snapshot(page)
    assert current["levelIndex"] == 0
    assert not current["progress"]["completed"]
    expect(page.locator("html")).to_have_attribute("lang", "en")
    context.close()
    checkpoint("current-version storage filters unknown puzzle IDs and out-of-range selections while keeping preferences")


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    executable = os.environ.get("BROWSER_EXECUTABLE") or shutil.which("chromium") or shutil.which("chromium-browser")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=executable, headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        passed = False
        try:
            data = desktop_checks(browser)
            mobile_checks(browser, data)
            storage_checks(browser, data)
            assert not ERRORS, "Browser errors:\n" + "\n".join(ERRORS)
            checkpoint("no JavaScript exceptions, failed requests, HTTP errors or console errors")
            passed = True
        except Exception:
            for context_index, context in enumerate(browser.contexts):
                for page_index, page in enumerate(context.pages):
                    try:
                        screenshot(page, f"failure-{context_index}-{page_index}")
                        (ARTIFACTS / f"failure-{context_index}-{page_index}.json").write_text(
                            json.dumps(snapshot(page), ensure_ascii=False, indent=2) + "\n"
                        )
                    except Exception:
                        pass
            raise
        finally:
            browser.close()
            report = {"passed": passed, "checks": CHECKS, "errors": ERRORS, "artifacts": str(ARTIFACTS)}
            (ARTIFACTS / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"Screenshots and report: {ARTIFACTS}", flush=True)


if __name__ == "__main__":
    main()
