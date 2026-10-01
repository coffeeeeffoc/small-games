# Independent browser interaction/visual review

Status: prepared only; waiting for the owner-confirmed stable source hash and URL. No old artifact has been opened or accepted. No physical device has been tested.

Read-only inspection covered `tests/flight-browser.mjs`, `tests/presentation.mjs`, `scripts/serve.mjs`, current HUD and its input/platform/effects paths. `tests/serve.mjs` does not exist; the server is under `scripts/`.

Production files are being edited by the owner. Review-owned paths are `tests/usability-review.mjs` and this report directory. Existing production changes were not touched.

Each scenario waits for both the read-only `__night` telemetry/audio/start control and the `#night-startup` overlay to be removed or hidden before sending any input. An opacity fade alone is not treated as ready; no fixed loading sleep is used.

## Run after stable-build notification

From the game directory in PowerShell:

```powershell
$env:NIGHT_URL = '<owner-confirmed URL>'
$env:NIGHT_EXPECTED_SOURCE_HASH = '<owner-confirmed 64-character source hash>'
node tests/usability-review.mjs
```

Optional targeted reproduction: `NIGHT_REVIEW_WIDTH=568|844|1366` and `NIGHT_REVIEW_CASE=<scenario substring>`. The script checks URL build-info against both the supplied hash and current production source before launching Chromium and after completing the review. A changed source/build invalidates acceptance.

## Coverage and evidence

- 568×320 / 844×390 Chromium emulated touch; 1366×768 mouse.
- Persistent settings/fullscreen in briefing, battle, manual pause and nested help; real `document.fullscreenElement` entry/exit; paused world/time preserved.
- Pause→settings→help→settings→pause→resume, settings toggles and language switch, help scrolling, modal outside input isolation.
- Fire drag-off/re-entry/cancellation, drawer actions, wheel over battlefield versus HUD, pinch and remaining-finger behavior; ammo/held-input checks.
- Thermal/daylight enemy and friendly focus, reticle and team marker legibility, actual heavy impacts, persistent dust and damage/wreck smoke where reached by live inputs.
- Timestamped screenshot + read-only snapshot pairs, input steps, Playwright traces, errors and results under a unique run directory. Screenshots still require visual inspection even if assertions pass.

The earlier browser helpers expect help as a directly reachable control and enemies to have no touch focus labels. Current HUD moves help into settings and adds touch focus labels. These older assertions must not be used as acceptance evidence without following the new actual UI.

No runtime findings are asserted by this preparation note. Build success, code inspection and emulated touch cannot establish physical-device acceptance.
