# 第三款 Cocos 发布与 Shell 接线交接

2026-10-22。分支 `codex/tianxia-cocos-campaign`；本次读取的 HEAD / 比较基线均为 `ba3f3966082a24861e1a05c1e1e293ae1f032136`。实现者已停止写入并交还唯一仓库写入权。没有提交、推送、安装依赖或修改游戏运行时、服务源码。

## 行为变化

- 天下岔路使用 `TIANXIA_PREBUILT_DIR`，沿用 Creator 3.8.8、`web-mobile`、source hash、入口和引擎声明验证。Turbo 增加环境透传和独立构建任务，未改 `validation-plan.mjs` 的依赖闭包。
- Windows producer matrix 增加第三款。复用要求三个 producer 成功、三个制品下载并通过 provenance 验证后才能重新上传；保留原两款步骤。CI quality、Pages build/logic、Android/iOS 共五个消费者均下载第三制品并设置环境变量，producer typecheck 同步透传。
- 根 `test:validation` 增加 `reuse-cocos-artifacts.test.mjs`；其测试路径进入既有 validation tooling 执行路径，保留导航样本。
- 白名单仅开放天下岔路 build/typecheck 到共享 toolchain/branding、typecheck 到卡丁车 package.json、artifact source hash 到四个共享输入，以及奖励测试的公共 publishing 对照读取。额外登记 `services/tianxia-server/tests/browser.mjs → games/local/tianxia-chalu/scripts/artifact.mjs`；相邻测试、服务运行时和其他游戏脚本均未开放。URL 检查解析静态字符串和有限字面量循环，不执行候选代码。
- `service_rule_sources` 和执行白名单增加 `services/tianxia-server`，引擎变化通过现有 workspace 依赖边选择服务完整 `test`。共享 Cocos branding 的真实消费者也增加天下岔路。
- Shell 将天下岔路作为沉浸游戏，主页入口依次点击 `#start`、`#begin-battle`。玩法检查读取只读 `tianxiaSnapshot()`，等待 ready/artReady，按 city.client 真实点击或触屏选择己城，点击 `#cycle` 并断言军令改变，再走暂停、恢复和返回主页。没有修改状态来通过测试。
- 增量分类要求四个工作流仅有固定新增块，撤销后与 base 全部字节相同；Turbo 撤销新增 task/env 后 deepEqual，拒绝重复 JSON key；Cocos literal 声明外字节不变；Shell 仅增加一个 ID；玩法检查通过 AST 定位天下岔路真实分支并保持分支外字节不变。证明位于旧 cage/CI 特例之前，不强制 `cocos:false`。
- 组合计划选中的浏览器是 `letters-words2 / tianxia-chalu / wulong-city / xiangqi-five`，保留 tooling、Shell 契约、乌龙城 dev-mode 手机 fixture 和真实服务测试。裸规划测试仅提供 Prettier，确认无需 js-yaml。

## 修改路径

```text
.github/workflows/carding-car.yml
.github/workflows/ci.yml
.github/workflows/pages-validate.yml
.github/workflows/mobile.yml
turbo.json
package.json
scripts/cocos-validation.mjs
scripts/cocos-validation.test.mjs
scripts/reuse-cocos-artifacts.mjs
scripts/reuse-cocos-artifacts.test.mjs
scripts/check-game-config.test.mjs
scripts/check-workspace-dependencies.mjs
scripts/check-workspace-dependencies.test.mjs
scripts/incremental-validation.mjs
scripts/incremental-validation.test.mjs
scripts/validate-tree.mjs
scripts/validate-tree.test.mjs
scripts/publication-scopes.mjs
scripts/publication-scopes.test.mjs
scripts/test-game-dev-mode.mjs
apps/shell-web/src/StandaloneGame.tsx
apps/shell-web/scripts/standalone-game-entry.mjs
apps/shell-web/scripts/standalone-game-entry.test.mjs
apps/shell-web/scripts/standalone-game-checks.mjs
apps/shell-web/scripts/pages-smoke.mjs
apps/shell-web/tests/standalone.integration.test.tsx
apps/shell-web/tests/standalone-immersive.integration.test.tsx
games/local/tianxia-chalu/docs/design/cocos-2026-10-22/infra-handoff.md
```

`scripts/check-game-config.mjs` 的实现无需修改；原有“两款制品”断言位于其测试中，已扩为三款。历史匿名服务迁移的 Pages 测试固定到本次交接前的工作流，继续检验原历史增量，不将本次第三制品新增当作该历史改动。

## 实际校验

环境：Windows / Node 24.21.0。以下命令均串行执行，Node 测试均使用 `--test-concurrency=1`。子测试只运行临时 fixture 或 mock，不启动真实 Creator / Chromium。

```powershell
node --test --test-concurrency=1 scripts/cocos-validation.test.mjs scripts/reuse-cocos-artifacts.test.mjs scripts/check-workspace-dependencies.test.mjs apps/shell-web/scripts/standalone-game-entry.test.mjs
```

最终重跑：35/35 通过，包含最新服务浏览器测试导入白名单及负例。

```powershell
node --test --test-concurrency=1 scripts/check-game-config.test.mjs scripts/check-workspace-dependencies.test.mjs
```

53 通过、0 失败、1 跳过；跳过的是 Windows 无符号链接创建权限的既有 workflow symlink 用例。之后新增的服务白名单用例已在上一条最终命令通过。

```powershell
node --test --test-concurrency=1 scripts/publication-scopes.test.mjs scripts/incremental-validation.test.mjs scripts/validation-plan.test.mjs
```

首轮 178 项：176 通过、2 失败。两处旧 fixture 已修复：共享后端脚本增加真实 tianxia-server 测试预期；历史 Pages 迁移不再误读当前第三制品工作流。未重复全套，复用其余有效结果；下面的定向命令覆盖修复及新增证明。

```powershell
node --test --test-concurrency=1 --test-name-pattern='third Creator|third artifact|Tianxia semantic|local validation aggregate|combined Tianxia|admin infrastructure|anonymous session migration' scripts/publication-scopes.test.mjs
```

9/9 通过，包含重复 ID/key、错 env/path、旧步骤修改、额外执行指令、其他游戏分支变化、伪装文本、丢失 package/catalog 身份和无 YAML 规划的正负例。

```powershell
node --test --test-concurrency=1 --test-name-pattern='Tianxia|admin gate executes|third Creator|combined Tianxia' scripts/check-workspace-dependencies.test.mjs scripts/validate-tree.test.mjs scripts/publication-scopes.test.mjs
```

8/8 通过。`admin gate executes` 使用临时 Node fixture，刻意抛出的 `admin browser regression` 是失败传播负例，测试本身通过，未启动浏览器。

```powershell
node --test --test-concurrency=1 --test-name-pattern='Cocos branding|third Creator|combined Tianxia' scripts/publication-scopes.test.mjs
```

5/5 通过，覆盖最后增加的共享 branding 消费者。

对上述源码和测试逐文件运行过 `pnpm exec prettier --write`；交接前对本次全部修改路径运行 Prettier 检查和 `git diff --check`。

## 留给主会话

- 主会话继续修正 Cocos Camera.worldToScreen/screenToWorld，保持只读 snapshot city.client 契约；本次触屏语义检查尚未浏览器实跑。
- 主会话自行修改服务 browser 文件，使用已开放的 sourceHash 精确测试导入边；此处没有修改该文件。
- 未运行实际 Creator、游戏/服务浏览器、Shell Vitest、完整候选验证或 CI/Pages 发布验证。不能将这里的 Node 契约通过作为这些验收通过。
- 继续按准确最终候选 SHA 流程整合、验证、提交和推 dev；当前运行文件未被作为冻结的 UI 基线。原有未提交内容保留。
