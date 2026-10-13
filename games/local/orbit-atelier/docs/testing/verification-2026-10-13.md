# 组合清单与诊断样板验证：2026-10-13

盘点基线：`793377e8bec7feb673bcd7314ec26496e81305d9`。诊断和独立复现代码 SHA：`bd479446a064508216bde3deb4d5e4b99bd21e29`。归档样例绑定这个准确 SHA，复现时先在独立工作树检出该版本并安装冻结依赖；不能直接在后续不同 SHA 运行而跳过版本校验。

## 覆盖改进

`tests/coverage.json` 有14个有限组合，12个复用已有断言，2个补齐确认的重要遗漏：独立竖屏拖动中 blur、sandbox iframe 横屏拖动中 hidden。每个回执对应实际 assertion 调用，记录实际视口/容器与源码位置；错误维度、缺少回执或缺少源码锚点都不能算覆盖。开发阶段生产浏览器运行14/14通过，已有10组流程检查通过；最终发布候选必须再次由准确 SHA 的增量门禁执行。

已执行 Orbit 规则和诊断自测29项（含74关实际规则求解），`scripts/validate-tree.test.mjs` 的25项门禁自测通过。新增自测覆盖重复/未知case、错维度/缺源码锚点、错误栈与脱敏/有界采集、换行规范化、随机端口签名、容器区分、不同 SHA/源指纹/制品 ID/脏源拒绝。候选门禁增加的执行列表仅为已选 Orbit 的 `publishing.browser.mjs` 与 `browser.mjs`，其余选择策略保持现有增量逻辑。

## 两个不同构建的控制失败

实际环境：Windows x64，Node24.21.0，pnpm12.6.0，Playwright1.55.1，显式系统 Chrome/Chromium154.0.8037.99。全部使用合成测试 profile，不连接真实用户数据或新服务。

| 样例                                         | 制品 ID                                                            | 实际错误容器            |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| [A 原失败](diagnostic-samples/failed-a.json) | `bd1d365dbc5464bb098fb29ae7b134579525acd00ba8c36e8d63fdd7404ad132` | standalone，390×844     |
| [B 原失败](diagnostic-samples/failed-b.json) | `72b43a38c183ca186b89375031aef9eef39dbeb0899a20fc490947f9077fae48` | sandbox iframe，390×844 |

A 使用正常 Vite base，B 使用 `/orbit-diagnostic-b/`；源 SHA 相同，但实际制品字节及总 ID 不同。两份都以显式测试 probe 抛出 `Orbit controlled diagnostic failure`，完整栈保留 `orbitDiagnosticProbe (/__orbit_diagnostic_probe.js:1:52)`。这是采集/关联控制测试，不是游戏故障或压缩源码映射验证；没有生成或发布 source map。

实际将 A 的 expected ID 用于 B 重建，测试退出1，浏览器尚未启动、无 pageerror，报告显示 `Reproduction build mismatch`；见 [预期版本拒绝记录](diagnostic-samples/version-guard.json)。这份记录用于验证防错配，不作为游戏失败复现样例。

## 独立 reviewer 仅凭报告复现

主会话暂交唯一写入权，reviewer 仅串行运行固定复现入口；没有改源码、Git、依赖或快照。命令在游戏目录执行：

```sh
node tests/reproduce-failure.mjs <absolute-failed-a.json>
node tests/reproduce-failure.mjs <absolute-failed-b.json>
```

两次在正常执行环境中退出0：内部浏览器子测试预期退出1，固定脚本校验 SHA/源/制品/错误签名匹配后成功。新证据为 [A 独立复现](diagnostic-samples/reproduced-a.json) 与 [B 独立复现](diagnostic-samples/reproduced-b.json)；两份完整 build、driver 指纹、pageerror 对象及动作序列与对应原报告一致。独立复现输出的报告 SHA-256：

- A：`62b51137b39df4706fb1e4ead51a6edc72db60a22675a3a77f77ad30c6bfba16`
- B：`50278c35210744b4a37f66713a86a18db9ae90859cac47992e81cac79654dd27`

首次沙箱执行 A 因本机导航 `ERR_NETWORK_ACCESS_DENIED` 不匹配，未算成功；正常环境的工具审批通过后重新执行并匹配。工作树最终保持干净。独立代码复核发现的 iframe 标注、动态端口签名、发布截图污染工作树问题均修正，pageerror 签名也绑定实际容器。

未完成 Android/iPhone/Safari 真机、原生小游戏平台、Orbit 跨域 iframe 和 Shell 手机横屏触屏验收。这些仍在清单中明确标为未验证，不能用当前 Chromium/CDP 与合成 blur/hidden 代替。最终发布 base/head、CI/Pages 的准确 SHA 和结论以本次候选日志及交付记录为准。
