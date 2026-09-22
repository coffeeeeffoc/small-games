# 六款游戏优化与独立复评结果

> 当前持续优化见 [2026-09-22 的 9.5 冻结验收记录](2026-09-22-six-games-95.md)。本页及第二轮分数均为历史记录，不作为新门槛的通过证据。

> 本页保留上一轮实施与验收记录，相关实现已进入 `510df72`。最新工作区修复、独立评分及证据见[第二轮复评](2026-09-21-six-games-round2.md)；下文“本轮”均指当时的历史记录。

2026-09-21。六个实现子任务均已完成；由未实现对应游戏的代理独立试玩、评分，并将发现的问题回交修复后再次验证。六款达到本轮 8 分门槛。以下为浏览器首发体验的专家评分，不是线上用户平均分，也不保证爆款。

| 游戏 | 初评 | 独立复评 | 本轮主要改进 |
| --- | ---: | ---: | --- |
| [浪湾卡丁车](../../games/local/carding-car/INDEPENDENT-REVIEW.md) | 7.0 | 8.1 | 实操驾驶教学、纪录目标与完赛奖励、横屏提示、未开放联机入口说明 |
| [围捕小队](../../games/local/cops-robbers/INDEPENDENT-REVIEW.md) | 7.5 | 8.3 | 七步首关教学、真实失败复盘、三星与最佳步数、窄屏修正 |
| [别跑！街区围捕](../../games/local/cops-robbers-realtime/INDEPENDENT-REVIEW.md) | 7.0 | 8.2 | 双警练习、收网与失守解释；修复慢速操作卡教学及复盘遮挡 |
| [词屿·字母叠叠乐](../../games/local/letters-words2/INDEPENDENT-REVIEW.md) | 6.5 | 8.2 | 教材单元与连续批次、自动解除无解余牌、续练、易错词复习、教材大小写 |
| [此时·此地](../../games/local/vibeJam-myself-history-guess/INDEPENDENT-REVIEW.md) | 7.5 | 8.3 | 旅途续玩、未探索场景优先、揭晓线索解释、限时恢复不重置 |
| [象五子棋](../../games/submodules/xiangqi-five/INDEPENDENT-REVIEW.md) | 6.0 | 8.2 | 默认单人、两档电脑、合法落点及五连提醒、可靠续局 |

词库完成外研教材 **26 册、5,588 条、313 个学习分组**：陈琳 2011 课标 14 册，孙有中 2022 课标 12 册。新版保持原书 Unit / Welcome / Starter，旧版依原书 Module / Unit；没有将旧版小学 Module 猜分到课内 Unit 1/2。新版六下和九下未在本批官方资源中提供，明确未收录。原有 22 份历史词表另保留整册模式。来源、页码、PDF 哈希及重建方法见 [教材数据说明](../../assets/english-dict/完整素材/reviewed-units/README.md)。

验证包含每款规则与构建、独立浏览器实际操作、词屿新版31词完整单元和尾批、教材哈希及单元隔离、42项Shell集成测试，以及六款发布产物的入口、手机操作、刷新直达与返回目录。卡丁车最新当前构建重新完成五步实操教学验证。真机微信/B站、实体手机性能与公网联机没有冒充验收通过；各独立报告列明具体证据及边界。

下一阶段是否具备爆款潜力，需要观察真实新手完成率、复玩和分享。现有报告分别列出驾驶技巧挑战、围捕教学迁移、单词发音/语境/分日复习、历史持续内容、棋类残局与棋力等后续空间。本轮不为抬分增加未经验证的系统。

本轮改动保留在工作区，未提交或推送；原有及同期其他任务的改动均保留。

## 验收方法与实施记录

**Goal:** Improve the six selected games, then use fresh reviewers and repeat fixes until each scores at least 8/10 under the same rubric. Scores are expert assessments, not measured public ratings.

**Architecture:** Keep each Game independent and reuse its existing rules, persistence, UI and build tools. Keep textbook provenance and unit mapping in `assets/english-dict`; export verified data into the word game. Preserve unrelated working-tree changes.

**Tech stack:** Existing JavaScript/TypeScript, Canvas, Cocos Creator, Three.js and repository test/build tools. No new platform or runtime dependency unless a concrete need requires one.

## Fixed review rubric

| Dimension | Weight | Evidence |
| --- | ---: | --- |
| Core gameplay and player agency | 30% | Real input changes outcomes; understandable win/loss; fair rules |
| First-session clarity | 20% | A new player learns the objective and core action inside the game |
| Mobile usability and feedback | 20% | Narrow/landscape layout, readable controls, cancellation, meaningful feedback |
| Replay and learning value | 15% | Useful goals/progression/challenges or focused learning; reliable persistence |
| Completeness and stability | 15% | No broken exposed primary flows; valid builds; lifecycle/error handling |

Pass: weighted score >= 8, no dimension below 6, and no unresolved severe gameplay blocker. Fresh reviewers must cite evidence and can score below target. Real-device, public networking and live deployment limitations remain explicit; local/browser success is not proof of native publication or real retention.

## Work ownership

- Kart agent: `games/local/carding-car/**` and necessary `services/kart-server/**`. Preserve the pre-existing `MultiplayerPanel.ts` edit and untracked `tests/bilibili-keyboard.mjs`.
- Word agent: `games/local/letters-words2/**`; dictionary data work under `assets/english-dict/**` may be transferred explicitly to a specialist. Reuse `letters-words` library patterns without changing that Game.
- Chess agent: `games/submodules/xiangqi-five/**`.
- Turn-based pursuit agent: `games/local/cops-robbers/**`.
- Real-time pursuit agent: `games/local/cops-robbers-realtime/**`.
- History agent: `games/local/vibeJam-myself-history-guess/**`.
- Coordinator: this plan, shared packaging/integration checks and final evidence. No commits or pushes are part of this request.

## Implementation and checks

1. Kart: teach actual steering/drift/nitro through gameplay; make route records useful; verify phone orientation and configuration availability. Run Game tests, typecheck, current Creator build and real-input browser checks.
2. Words: inspect authoritative textbook sources and available PDFs; preserve edition/book/unit provenance; never infer units by evenly dividing words. Add book/unit selection and bounded practice, improve valid-spelling dead ends, and validate duplicate characters, punctuation, scope isolation, progress and narrow screens. Record exact supported and unresolved book counts.
3. Chess: make single-player entry playable, preserve same-screen/network rules, add first-game clarity and reliable local resume. Validate AI legality, stale turns, both boards, restart, persistence and mobile input.
4. Turn-based pursuit: improve early-level teaching, failure explanation and meaningful repeat challenges while preserving real escape and necessary cooperation. Run all level solutions and interaction checks.
5. Real-time pursuit: make escape/capture conditions visible, teach dispatch and collaboration, and preserve tactical rules. Run engine, 48-level strategy and lifecycle checks.
6. History: strengthen clues and post-answer reasoning, replay selection and reliable interrupted-session recovery. Keep AI reconstruction labels and historical-source distinctions. Run catalog/rule/build checks and actual guess/reveal/resume flows.

Each implementer records changes, runnable commands/results and remaining limits in its Game's `RELEASE-REVIEW.md` (or suitable existing document). Do not label an implementer's self-score as independent acceptance.

## Independent review and iteration

After implementation, launch fresh agents to inspect code and current built gameplay, score all five dimensions, and list precise blockers. Reviewers cannot lower the rubric to meet the target. Route findings to the responsible implementer, rerun relevant checks and request fresh scoring for changed Games. Six separate implementation agents and a separate review round are required; concurrency is limited to three child agents at a time.

## Integration verification

- `pnpm check:games` and `pnpm test:game-config`.
- Appropriate per-Game tests/builds plus targeted Shell iframe entry/return/deep-link checks on the six fresh artifacts.
- Verify dictionary exports and byte hashes without changing unrelated game data.
- Inspect final diff and nested submodule status; preserve pre-existing changes and report uncommitted deliverables honestly.

## Final verification

- Six implementation tasks and an independent review round completed. Weighted scores: kart 8.055, pursuit 8.305, real-time pursuit 8.165, words 8.21, history 8.33, chess 8.19; display to one decimal. All dimensions >=6, no outstanding severe blocker in the evaluated browser scope.
- Review fixes: usable-width overflow in pursuit; slow tutorial input intercepted by the first cop and obstructed failure review in real-time pursuit. Both games now have 16 browser checks; independent actual retest passed.
- All 12 selected official new-edition PDFs downloaded and manually reviewed. Their SHA-256, counts, order, duplicates and reproducible LF output passed checks. Old primary samples were independently checked again with no discrepancies.
- Final dictionary export: 48 books total, including 26 PDF-reviewed textbooks, 5,588 entries and 313 learning groups. New edition: 12 books / 2,364 entries / 74 groups (72 Unit + Welcome/Starter). Historical edition: 14 books / 3,224 entries / 239 groups.
- Words engine/library/check/build pass. Desktop/390/320 real-input regression passes; new 390px textbook test completes all 31 words across six batches, one-word tail, reload, original case, hinted-word review and cached-book practice after going offline. A separate reviewer reran that test.
- `pnpm check:games`: 25 games, 0 issues. `pnpm test:game-config`: 19/19. Shell integration: 42/42. Full Pages build passed after final data sync; build log `.scratch/release-final-build.log`. Six-game actual iframe/direct mobile/deep-link/return evidence: `.scratch/release-six-shell/report.json`.
- Kart source includes preserved concurrent native keyboard changes. Latest verified H5 build hash: `674b4498f595f8f016f06966fda92dc7ae767e71e5a08dedb71c666b0da41572`; the real-input five-step coach, persistence, replay, portrait and unavailable-multiplayer check passed again on that build. Native/public-network acceptance remains separate.
