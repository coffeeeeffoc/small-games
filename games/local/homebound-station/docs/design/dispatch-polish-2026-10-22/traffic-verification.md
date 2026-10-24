# Homebound parallel dispatch v4 evidence

Repository was read-only for this agent. Root applied `/tmp/homebound-dispatch-fix-v4/update.patch`; source and tests in that directory are the readable delivery. `full.patch` shows the complete change against the original HEAD. Original dev test text and `tests/support/solver.ts` remain unchanged; five additional behavior regressions were added.

## Confirmed original cause

`dispatch()` already accepted separate jobs and bound their passenger locations immediately. Actual movement was held by `crossingReserved()`, which treated each earlier taxi's entire remaining trip plus a future departure after boarding as reserved road. A north-facing car could remain in its slot despite the earlier car being far away. Counting accepted services did not detect this.

## Final behavior

- Current nearby traffic is considered only up to 18 metres of route distance, equivalent to two seconds at the unchanged 9 m/s speed. Walking and boarding create no future departure reservation.
- Local conflicts use finite segment intersections or closest finite point pairs. Infinite-line intersections behind a car or beyond its turn cannot be mistaken for an immediate conflict.
- A pair's first right of way is fixed until the winning car clears the short conflict, avoiding priority reversals after a waiting car has partly entered. Click order breaks equal arrival estimates.
- A final bay approach is committed before driving into it. Until the commitment, a bounded through-lane safety envelope accounts for the possibility of continuing around the ring. The route cannot suddenly change beside a north exit and invalidate another car's waiting position.
- A car whose bay is unavailable circulates instead of stopping on the through lane. Neighboring bay approaches/turns have local exclusion; nonadjacent bays remain independent. Crossing priorities are discarded on a changed route, arrival, or departure start.

## Visible movement proof

Both scenarios click A at 0 seconds and B at 0.5 seconds. All listed frames precede any passenger delivery.

| A / B layout                   | Original B first movement | v4 B first movement | B at 0.6 seconds              | B at 1.6 seconds               |
| ------------------------------ | ------------------------: | ------------------: | ----------------------------- | ------------------------------ |
| N column 0 / N column 4, row 0 |                   17.15 s |              0.55 s | old `(8,8)` / new `(8,7.1)`   | old `(8,8)` / new `(14.4,4.5)` |
| W column 0 / N column 1, row 0 |                    5.30 s |              0.55 s | old `(-4,8)` / new `(-4,7.1)` | old `(-4,8)` / new `(2.4,4.5)` |

Raw proof: [movement proof](evidence/movement-proof.json).

## Validation

- Original 100 levels × forward/reverse/random = 300 full solves passed. Existing independent oriented-car collision checks, passenger ID conservation, fixed pickup locations, pause, and 1/2/3/5-speed equivalence passed.
- Two north-exit layouts × 97 dispatch delays × passenger counts 1–4 = 776/776 solves passed. Minimum active-car centre distance was 3.50012 m. This sweep is included as a permanent behavior regression.
- 18 exact action sequences from the failed intermediate implementations all completed, with every recorded dispatch still accepted. Four distinct root-cause sequences are permanent regression tests: levels 1, 56, 94, 98.
- Independent 100 levels × seeds 1–7 = 700/700 solves with one legal click every 0.05–1.0 seconds. Maximum completion time was 135.9 simulated seconds. No further seed expansion was used after these checks passed.
- Readable source passed TypeScript 5.8 strict/noUncheckedIndexedAccess/noEmit. Its five new behavior tests passed after helper extraction/formatting.

Independent frozen v4 test snapshot SHA256: `4d942f738032775558e649e97d083f21a35aa39b9a27928ed4a4845cb3f3ce88` (readable delivery is behavior-equivalent with extracted helper functions/comments).

Logs: [delay sweep](evidence/delay-sweep.json), [exact replays](evidence/replay-18.log), [random timing](evidence/random-700.log).

## Safety, performance, and limits

The original 3.43 m enclosing-circle collision limit, 0.1 m substeps, 0.05 s fixed simulation step, car dimensions, speed, arrow directions, click assignment order, passenger positions, and split API are preserved. There is no teleporting, overlap escape, timeout completion, or collision relaxation.

Local bay exclusion can require another lap. It guarantees an unblocked through lane and stable approach, not shortest arrival time or arrival order. In the two-N example the entire level takes 31.00 s rather than the original 34.10 s; the important visible fix is B leaving at 0.55 s instead of 17.15 s. Cars facing a real nearby collision still yield. The test results are strong regression evidence, not a formal proof for all conceivable timings or custom levels.

One cloud Node measurement of level 100 (20 cars, 0.5-second dispatch cadence): all cleared in 91.5 simulated seconds / 1,830 ticks. Simulation `advance` averaged 0.316 ms per tick, p95 0.877 ms, maximum 4.97 ms; peak 20 driving/departing services and 57 stored pair priorities. There are at most 190 pair keys for 20 cars. This is a rule-engine measurement, not a claim about Creator rendering or phone FPS.

## Creator iterable boundary

Read-only inspection of actual Creator build `/tmp/homebound-polish-900f2013` confirms the StationWorld Map spreads now compile to `[].concat(Array.from(map.values()), ...)`. Remaining Map/entries `for-of` loops use `createForOfIteratorHelperLoose`; the actual `bundle.5227e.js` helper explicitly reads `Symbol.iterator`. New core state uses a plain Record and Object.keys arrays, with no Map/Set spread. Existing delivered-set snapshots use Array.from. Genuine final Creator build/render checks remain the root task.

Root integrated source: 15/15 rules tests passed with Node 24.21.0; direct type check passed using TypeScript 7.0.2 and the genuine Creator 3.8.8 cc.d.ts. Full Web verification is recorded separately.
