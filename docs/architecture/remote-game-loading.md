# Remote Game loading

Web Shell can select a remote Cultivation release from its static Catalog. Without remote configuration it keeps using the built-in Game.

## Build and serve

Build `@coffeeeeffoc/game-cultivation` with `VITE_SHELL_ORIGIN` set to the exact Shell origin. The iframe build produces `dist-iframe/remote-entry.js`, a self-contained ES module including styles and the child Host bridge. Serve this file from an origin different from Shell, with no redirect, and compute its SHA-256 after building.

Configure the Shell build with `VITE_CULTIVATION_ARTIFACT_URL`, `VITE_CULTIVATION_ARTIFACT_VERSION` (currently `1.0.0`) and `VITE_CULTIVATION_ARTIFACT_INTEGRITY` (`sha256-` followed by the Base64 digest). The Catalog is the trusted source of the expected digest; never derive it from the downloaded response.

The Artifact server must allow CORS from Shell and expose `Content-Security-Policy`. Its required CSP is:

```text
default-src 'none'; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; style-src 'unsafe-inline'; frame-ancestors https://shell.example
```

Replace the final origin with the exact Shell origin. `style-src 'unsafe-inline'`, `img-src data:` and `font-src data:` are the only optional directives. Duplicate or additional directives are rejected.

## Trust and lifecycle

Shell fetches once without credentials, checks the policy and digest, then embeds those same verified bytes as a data-module in a `srcdoc` iframe. There is no second remote fetch and no HTML entry point. The iframe has only `sandbox="allow-scripts"`: its execution origin is opaque (`null`), separate from Shell and the Artifact server. The enforced document CSP omits `frame-ancestors`, which is not supported in a meta policy; the response header is validated before creating the frame.

Shell checks the exact iframe WindowProxy and opaque origin on every incoming message. The child checks Shell's WindowProxy and configured origin. Protocol, Game, Session, method parameters and results are validated, with access limited to capabilities declared by the selected Manifest and granted by the Session. No token, Cookie or platform SDK reference is sent. CSP restricts resource loading; it is not a general guarantee against all iframe self-navigation or side channels.

Handshake metadata must match the selected Manifest except its integrity field: a bundle cannot embed its own digest. Integrity is instead bound to the bytes before execution. Launch completes only after the child finishes mounting and reports readiness. Timeout, cancellation and disposal remove the frame/listener and reject outstanding operations.

Pause, resume and disposal use correlated, schema-validated acknowledgements. The loader propagates remote lifecycle errors to Shell. It keeps the frame and Host RPC alive until asynchronous Game disposal completes, then removes the sandbox; a missing acknowledgement times out and still forces removal.

Fallback order is target release, distinct last-known-good release, then built-in Game. Two failures open a per-version circuit for one minute. Shell retains the breaker across directory re-entry and caches successful release metadata in local storage; every cached Artifact is validated again before execution.

## Verification

Loader tests cover message validation, permissions, lifecycle races and fallback. Run `pnpm --filter @coffeeeeffoc/shell-web smoke:remote` for a real-browser check that builds and serves the Artifact on a separate origin, launches it, checks DOM/Cookie isolation, pauses/resumes, makes a game choice and disposes it. Install Playwright Chromium first, or set `PLAYWRIGHT_EXECUTABLE_PATH` to an existing Chromium-family browser executable.
