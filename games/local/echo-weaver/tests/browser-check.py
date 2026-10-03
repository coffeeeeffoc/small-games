#!/usr/bin/env python3
"""Exercise the shipped game in Chromium using only its public UI controls.

Run `npm run test:browser` to build and start the preview automatically. Requires
Python Playwright plus Chromium (BROWSER_EXECUTABLE can select another binary).
Artifacts go to ECHO_WEAVER_ARTIFACTS or the system temporary directory.
"""

import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

from playwright.sync_api import sync_playwright, expect


ORIGIN = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4413/"
ARTIFACTS = Path(os.environ.get("ECHO_WEAVER_ARTIFACTS", str(Path(tempfile.gettempdir()) / "echo-weaver")))
ERRORS = []
CHECKS = []


def checkpoint(message):
    CHECKS.append(message)
    print("PASS:", message, flush=True)


def snapshot(page):
    return page.evaluate("window.__echoWeaverSnapshot()")


def phase(page, value):
    page.wait_for_function("value => window.__echoWeaverSnapshot?.().phase === value", arg=value)
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
    # The solver supplies expected choices only; no test writes game state.
    return page.evaluate("""async () => {
      const { LEVELS } = await import('./levels.mjs');
      const { createState, enumerateSolutions, simulate } = await import('./engine.mjs');
      return LEVELS.map(level => {
        const solution = enumerateSolutions(level)[0];
        return {
          id: level.id, initial: createState(level), solution,
          report: simulate(level, solution),
          initialReport: simulate(level, createState(level)),
          tickMs: level.beatMs / level.ticksPerBeat,
          minEnergy: level.minEnergy,
          controls: [
            {id: 'splitter', count: level.splitter.modes.length},
            ...level.routes.flatMap(route => route.stages.map(stage => ({id: stage.id, count: stage.options.length})))
          ]
        };
      });
    }""")


def press(page, selector, touch=False):
    locator = page.locator(selector)
    if touch:
        locator.tap()
    else:
        locator.click()


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
    return current


def control_value(state, control):
    return state["splitter"] if control == "splitter" else state["choices"][control]


def solve_with_controls(page, fixture, touch=False):
    for control in fixture["controls"]:
        desired = control_value(fixture["solution"], control["id"])
        for _ in range(control["count"]):
            before = snapshot(page)
            if control_value(before["state"], control["id"]) == desired:
                break
            press(page, f'#scene-controls [data-control="{control["id"]}"]', touch)
            after = snapshot(page)
            assert after["state"] != before["state"], f"Control {control['id']} did not change state"
            assert after["historyLength"] == before["historyLength"] + 1, "Each actual edit is undoable"
        assert control_value(snapshot(page)["state"], control["id"]) == desired, control
    assert snapshot(page)["state"] == fixture["solution"]


def emit_and_finish(page, expected, touch=False):
    press(page, "#emit", touch)
    started = phase(page, "running")
    assert started["report"]["won"] == expected["won"]
    if expected["won"]:
        for index in (0, 1):
            threshold = expected["echoes"][index]["arrival"] + .1
            page.wait_for_function("threshold => window.__echoWeaverSnapshot().elapsed >= threshold", arg=threshold)
            for number, echo in enumerate(expected["echoes"]):
                expect(page.locator(f'#mini-beat-{echo["id"]}')).to_have_attribute("data-status", "hit" if number <= index else "waiting")
    phase(page, "result")
    expect(page.locator("#result")).to_be_visible()
    completed = snapshot(page)
    assert completed["report"] == expected, completed["report"]
    for echo in expected["echoes"]:
        expect(page.locator(f'#mini-beat-{echo["id"]}')).to_have_attribute("data-status", "hit" if echo["status"] == "on-time" else "miss")
    return completed


def no_overflow(page, label):
    dimensions = page.evaluate("""() => ({
      viewport: innerWidth,
      html: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    })""")
    assert max(dimensions["html"], dimensions["body"]) <= dimensions["viewport"] + 1, f"{label}: {dimensions}"


def control_geometry(page, label):
    source_alignment = page.evaluate("""() => {
      const source = document.querySelector('#scene-controls [data-emit]').getBoundingClientRect();
      const ring = document.querySelector('#source-ring').getBoundingClientRect();
      return {x: source.x + source.width / 2 - ring.x - ring.width / 2,
        y: source.y + source.height / 2 - ring.y - ring.height / 2};
    }""")
    assert abs(source_alignment["x"]) < 2 and abs(source_alignment["y"]) < 2, f"{label}: HTML controls must align with SVG paths: {source_alignment}"
    controls = page.locator("#scene-controls [data-control], #scene-controls [data-emit]").evaluate_all("""elements => elements
      .filter(element => !element.disabled && element.getAttribute('aria-disabled') !== 'true')
      .map(element => {
        const box = element.getBoundingClientRect();
        return {id: element.dataset.control || 'source', x: box.x, y: box.y, right: box.right,
          bottom: box.bottom, width: box.width, height: box.height};
      })""")
    for control in controls:
        assert control["width"] >= 36 and control["height"] >= 36, f"{label}: target too small {control}"
        assert control["x"] >= 0 and control["right"] <= page.viewport_size["width"] + 1, f"{label}: offscreen {control}"
    for i, first in enumerate(controls):
        for second in controls[i + 1:]:
            separated = first["right"] <= second["x"] or second["right"] <= first["x"] or first["bottom"] <= second["y"] or second["bottom"] <= first["y"]
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


def desktop_checks(browser):
    context = browser.new_context(viewport={"width": 1440, "height": 1100}, locale="zh-CN")
    page = open_game(context, "desktop")
    data = fixtures(page)
    assert len(data) == 8
    assert not any(item["initialReport"]["won"] for item in data)
    screenshot(page, "desktop-initial")
    no_overflow(page, "desktop")

    # A short route must fail even though its echo reaches the receiver.
    failed = emit_and_finish(page, data[0]["initialReport"])
    assert not failed["report"]["won"]
    assert any(echo["status"] == "early" for echo in failed["report"]["echoes"])
    screenshot(page, "desktop-early-result")
    press(page, "#continue")
    expect(page.locator("#result")).not_to_be_visible()
    assert snapshot(page)["phase"] in ("ready", "result")
    assert snapshot(page)["state"] == data[0]["initial"]
    checkpoint("an early echo fails; retry returns to an editable board")

    select_level(page, 6, data[6])
    press(page, "#emit")
    phase(page, "running")
    page.wait_for_function("window.__echoWeaverSnapshot().elapsed >= 3.5")
    expect(page.locator("#particle-b")).to_have_attribute("opacity", "0")
    phase(page, "result")
    for route in ("b", "c"):
        expect(page.locator(f"#arrival-{route}")).to_have_attribute("opacity", ".2")
        expect(page.locator(f"#mini-beat-{route}")).to_have_attribute("data-status", "miss")
    assert snapshot(page)["report"] == data[6]["initialReport"]
    checkpoint("a blocked pulse disappears at the absorber and never lights the receiver")
    select_level(page, 0, data[0])

    before = snapshot(page)
    press(page, '#scene-controls [data-control="b-mirror"]')
    changed = snapshot(page)
    assert changed["state"] != before["state"]
    press(page, "#undo")
    assert snapshot(page)["state"] == before["state"]
    assert snapshot(page)["historyLength"] == before["historyLength"]
    press(page, '#scene-controls [data-control="b-mirror"]')
    press(page, "#restart")
    assert snapshot(page)["state"] == data[0]["initial"]
    assert snapshot(page)["historyLength"] == 0
    checkpoint("reflector edits, undo and restart preserve exact state")

    # Real time, requestAnimationFrame and real SVG geometry are inspected.
    solve_with_controls(page, data[0])
    press(page, "#emit")
    phase(page, "running")
    page.wait_for_timeout(240)
    moving = snapshot(page)
    assert moving["elapsed"] > 0
    particle = page.locator("#particle-a")
    first_position = (particle.get_attribute("cx"), particle.get_attribute("cy"))
    expect(particle).to_have_attribute("opacity", "1")
    page.wait_for_timeout(100)
    second_position = (particle.get_attribute("cx"), particle.get_attribute("cy"))
    assert first_position != second_position, "Visible wave particle did not travel"
    verify_pause_icon(page)
    screenshot(page, "desktop-playing")
    press(page, "#pause")
    paused = phase(page, "paused")
    page.wait_for_timeout(300)
    assert snapshot(page)["elapsed"] == paused["elapsed"], "Paused clock advanced"
    press(page, "#pause")
    phase(page, "running")
    page.wait_for_timeout(160)
    assert snapshot(page)["elapsed"] > paused["elapsed"]
    press(page, "#help")
    phase(page, "paused")
    expect(page.locator("#help-dialog")).to_be_visible()
    press(page, "#close-help")
    phase(page, "paused")
    press(page, "#pause")
    phase(page, "running")
    press(page, "#emit")
    stopped = phase(page, "ready")
    assert stopped["state"] == data[0]["solution"]
    page.wait_for_timeout(300)
    assert snapshot(page)["phase"] == "ready", "Cancelled callback reopened a result"
    checkpoint("animation advances; pause and help freeze time; two SVG bars render; stop cancels playback")

    # Explicitly exercise mute as a public preference, then solve the campaign.
    if page.locator("#sound").get_attribute("aria-pressed") != "true":
        press(page, "#sound")
    expect(page.locator("#sound")).to_have_attribute("aria-pressed", "true")
    press(page, "#sound")
    expect(page.locator("#sound")).to_have_attribute("aria-pressed", "false")
    for index, fixture in enumerate(data):
        select_level(page, index, fixture)
        solve_with_controls(page, fixture)
        control_geometry(page, f"desktop level {index + 1}")
        result = emit_and_finish(page, fixture["report"])
        assert result["report"]["won"]
        assert [echo["arrival"] for echo in result["report"]["echoes"]] == [4, 8, 12]
        assert all(echo["energy"] >= fixture["minEnergy"] for echo in result["report"]["echoes"])
        expect(page.locator("#beat-lights .hit")).to_have_count(3)
        if index == 7:
            screenshot(page, "desktop-campaign-complete")
        print(f"  Desktop level {index + 1}: exact arrivals 4 / 8 / 12; won muted", flush=True)
        if index < len(data) - 1:
            press(page, "#continue")
            advanced = phase(page, "ready")
            assert advanced["levelIndex"] == index + 1
            assert advanced["state"] == data[index + 1]["initial"]
    checkpoint("all eight levels win via real control clicks and exact internal arrival times while muted")

    # Closing a completed result must restore editing and allow a fresh run.
    dismiss_result(page)
    old_state = snapshot(page)["state"]
    press(page, '#scene-controls [data-control="a-delay"]')
    assert snapshot(page)["state"] != old_state
    press(page, "#undo")
    assert snapshot(page)["state"] == old_state
    emit_and_finish(page, data[-1]["report"])
    dismiss_result(page)
    checkpoint("completed result can be dismissed, edited, undone and replayed")

    # Verify language and preference persistence after a full campaign.
    press(page, "#language")
    expect(page.locator("html")).to_have_attribute("lang", "en")
    saved = snapshot(page)["progress"]
    page.reload(wait_until="networkidle")
    phase(page, "ready")
    restored = snapshot(page)
    assert restored["levelIndex"] == 7
    assert restored["progress"] == saved
    expect(page.locator("html")).to_have_attribute("lang", "en")
    expect(page.locator("#sound")).to_have_attribute("aria-pressed", "false")
    expect(page.locator("#level-nav .done")).to_have_count(8)
    checkpoint("all completed levels, selected level, language and mute survive reload")
    context.close()
    return data


def mobile_checks(browser, data):
    context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2, locale="zh-CN")
    page = open_game(context, "mobile")
    screenshot(page, "mobile-390-initial")
    no_overflow(page, "390px portrait")
    for index, fixture in enumerate(data):
        select_level(page, index, fixture, touch=True)
        control_geometry(page, f"390px level {index + 1}")
        solve_with_controls(page, fixture, touch=True)
        emit_and_finish(page, fixture["report"], touch=True)
        if index == 7:
            screenshot(page, "mobile-390-win")
    checkpoint("all eight puzzles finish using real touchscreen taps at 390px")

    select_level(page, 7, data[7], touch=True)
    # Native touch cancellation must not commit the pressed scene control.
    button = page.locator('#scene-controls [data-control="a-mirror"]')
    button.scroll_into_view_if_needed()
    box = button.bounding_box()
    before = snapshot(page)
    cdp = context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []})
    cdp.detach()
    assert snapshot(page)["state"] == before["state"]
    assert snapshot(page)["historyLength"] == before["historyLength"]

    for width, height, label in [(320, 844, "320-portrait"), (844, 390, "844-landscape")]:
        page.set_viewport_size({"width": width, "height": height})
        no_overflow(page, label)
        control_geometry(page, label)
        solve_with_controls(page, data[7], touch=True)
        screenshot(page, f"mobile-{label}")
        emit_and_finish(page, data[7]["report"], touch=True)
        select_level(page, 7, data[7], touch=True)
    checkpoint("320px and landscape layouts have no horizontal overflow or overlapping scene controls; cancelled touch does not edit")
    context.close()


def blocked_storage_check(browser, data):
    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="zh-CN")
    context.add_init_script("""Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage blocked by browser regression test', 'SecurityError'); }
    });""")
    page = open_game(context, "blocked-storage")
    solve_with_controls(page, data[0])
    emit_and_finish(page, data[0]["report"])
    context.close()
    checkpoint("blocked browser storage does not prevent solving a puzzle")


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    executable = os.environ.get("BROWSER_EXECUTABLE") or shutil.which("chromium") or shutil.which("chromium-browser")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=executable, headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        passed = False
        try:
            data = desktop_checks(browser)
            mobile_checks(browser, data)
            blocked_storage_check(browser, data)
            assert not ERRORS, "Browser errors:\n" + "\n".join(ERRORS)
            checkpoint("no JavaScript exceptions, failed requests, HTTP errors or console errors")
            passed = True
        finally:
            browser.close()
            report = {"passed": passed, "checks": CHECKS, "errors": ERRORS, "artifacts": str(ARTIFACTS)}
            (ARTIFACTS / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"Screenshots and report: {ARTIFACTS}", flush=True)


if __name__ == "__main__":
    main()
