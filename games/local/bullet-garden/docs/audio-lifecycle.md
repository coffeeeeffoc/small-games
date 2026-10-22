# Confirmation audio lifecycle

The existing sound setting controls the confirmation clip. Manual gameplay pause
does not mute menu feedback: pause, resume and return-home gestures still confirm
the current action. Showing the app again does not resume gameplay or play sound.
Muting, leaving the foreground and destroying the scene stop current feedback.
Enabling sound confirms that new gesture; disabling it is immediately silent.

The actual whole-node destruction test also exposed an existing view cleanup
error: Creator destroys child nodes before the parent component's `onDestroy`,
so the Camera's node can already be null. View disposal is now idempotent and
accepts that already-destroyed child while retaining asset release. This changes
cleanup only, not active rendering.

The same `confirm.wav` and gain (0.25) now use one controllable `AudioSource`.
Repeated gestures restart the short confirmation at its beginning. Cocos 3.8.8
`playOneShot` creates a separate asynchronous player that the source's `stop`,
volume and destruction cannot control. The lifecycle cleanup therefore silences
the controlled source, stops it, detaches its clip and retires that source. The
next gesture creates a fresh source, so an old asynchronous load of the same clip
cannot replace the new player. A pending context unlock cannot revive an old
gesture. The retained clip is released when the component is destroyed.

## Reproduce the browser regression

Build the current sources with the repository's normal Creator 3.8.8 web-mobile
build, then run from this game's directory:

```sh
node tests/cocos-audio.browser.mjs
```

The test rejects an outdated source hash or modified runtime manifest. It uses
the real production scene, touchscreen input and browser audio implementation.
Instrumentation forwards native WebAudio calls and records source starts, stops,
ended/disconnect events, context state, actual gain, decoded sample amplitude and start
offset. A silent buffer or a settings boolean alone cannot satisfy the checks.
The output is `audio-lifecycle.json` under `QA_OUTPUT`, or the existing browser
acceptance output directory when that variable is absent.

Coverage:

- No startup playback; the first real touch plays the nonzero confirmation clip.
- Muting stops an active native source, persists and keeps subsequent gestures
  silent; enabling plays a fresh confirmation.
- Browser blur and Creator hide/pause events stop audio; show/resume events do
  not replay it. A subsequent touch starts at offset zero.
- Manual pause freezes simulation while pause/resume/menu confirmations remain
  available.
- A delayed native audio-context resume followed by mute cancels the pending
  gesture. Releasing the real context does not play it.
- Delivery of a real engine-created player is delayed across mute/unmute for
  the same clip; releasing the old player cannot replace the new playable source.
- Scene destruction stops the live source and later foreground events stay
  silent.
- Delayed real audio HTTP responses after backgrounding or destruction do not
  replay old gestures; returning from background still accepts a fresh touch.

This is desktop Chromium with mobile touch emulation. Lifecycle events and
delayed load/resume are explicit test fixtures around real browser operations.
It does not claim acoustic speaker measurement, human listening, mobile-device
testing, or acceptance in WeChat/TapTap native hosts.

## Recorded acceptance, 2026-10-22

The original Creator artifact failed the new regression because muting never
called native stop on the live one-shot. The final artifact passed all nine
recorded checks with no browser errors; see
[the native playback evidence](diagnostics/audio-lifecycle-2026-10-22.json).
Its sourceHash is `d8bc6077484acd06ebac1c47620363d69f07cd019fabc541faa730558a6586a5`.
The existing `test:browser` / Creator browser entry runs this regression after
the normal gameplay acceptance, so later CI retains this coverage.
