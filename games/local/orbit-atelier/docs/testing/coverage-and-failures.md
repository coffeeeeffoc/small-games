# Orbit 组合覆盖与失败证据

本样板从 `793377e8bec7feb673bcd7314ec26496e81305d9` 的测试和产品约定盘点，只改变测试和诊断。游戏仍采用竖屏主设计与横屏紧凑布局，见 [设计说明](../design/README.md)；拖动取消/失焦回滚约定见 [真实互扣方案](../design/real-interlock-2026-10-13/README.md)。

## 可执行组合清单

[coverage.json](../../tests/coverage.json) 定义有限、合法且有事件顺序的组合。`verify(id, target, assertion)` **先执行有效断言**，再核对实际视口方向、实际 iframe/独立容器和输入事件，最后写入 receipt。输入证据来自当前文档收到的 `isTrusted`、对应 `pointerType` 的 `pointerdown`，每项必须比该文档上次回执新增事件；页面导航后重新计数，合成 `dispatchEvent` 不算输入。运行报告包含实际事件数量、断言说明、源码行、driver SHA-256 和构建身份。静态清单、文字 checks、截图和未执行的条件分支不计入覆盖；完整专项缺任一 receipt 会失败。

```sh
pnpm --filter @coffeeeeffoc/orbit-atelier test
pnpm --filter @coffeeeeffoc/orbit-atelier test:browser
# 以下命令在游戏目录执行；无报告时所有项显示为未执行
node tests/coverage-report.mjs
node tests/coverage-report.mjs <absolute-browser-report.json>
```

已有用例中的目录锁定、触屏暂停、空闲失焦/后台与存档恢复、末环释放后立即失焦结算、正常奖励、横屏触屏、小屏保留状态、末关试玩隔离、章节边界、44px 命中、桌面全屏拒绝、损坏/禁用存储、竖屏 sandbox iframe 均复用原断言。清单 ID 对应 `browser.mjs` 的实际 `verify` 调用，运行回执给出当前行号。

只增加两个确认的重要遗漏：

| ID                   | 因素与顺序                                                                                   | 有效断言                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `held-blur`          | 独立 × 竖屏 × 触屏：按住旋转 → 合成 blur → 旧 touchEnd → 恢复 → 新手势                       | 中断前 drag 存在、角度确已变化；完整 state/moves/hints 回滚、drag 清空；旧释放不提交；新手势减少一个环 |
| `iframe-held-hidden` | sandbox iframe × 横屏 × 触屏：按住旋转 → 合成 hidden → 旧 touchEnd → visible → 恢复 → 新手势 | 同上，使用真实 iframe SVG 的坐标映射，覆盖三个因素及事件先后关系                                       |

其他实际测试的范围保持独立，不将规则求解扩成触屏证据：

| 执行命令/入口                       | 实际断言来源                                                                                             | 覆盖边界                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 游戏 `test`                         | `tests/core.test.ts` 的 74 关 rotate/release 求解、存档/奖励规则                                         | Node 规则，无 DOM/设备输入             |
| 游戏 `test:publishing:browser`      | `tests/publishing.browser.mjs` 的 `release(true)` 整个 state 回滚、挑战隔离、分享参数清理/取消、主线恢复 | 独立手机 Chromium 模拟                 |
| 现有增量 `run-selected-browser.mjs` | `exerciseStandalone` → `standalone-game-checks.mjs` 的 Orbit 环减少、撤回、暂停恢复                      | 独立鼠标与手机触屏；由既有候选门禁执行 |
| 现有 Pages `pages-smoke.mjs`        | 同一 Orbit 行为断言，Shell iframe 路径默认 mouse                                                         | 不能据此声称 Shell 手机横屏触屏已测    |

未验证、确实不支持与不适用分别列在清单 `gaps`，不混为一类。存储被禁用时不要求跨 reload 持久保存；挑战/试玩不要求主线奖励；双环同时拖动没有产品支持。未生成全游戏/全平台笛卡尔积，也不声称两因素覆盖率达到某个百分比。

## 失败报告与复现

默认报告位于仓库 `.scratch/orbit-atelier/<制品哈希前12位>/<本次时间>/browser-report.json`。`ORBIT_EVIDENCE_DIR` 可指定输出目录，不再覆盖已提交设计截图。报告保存完整 pageerror/runner 栈、HTTP 失败状态、准确 Git revision、是否存在已跟踪未提交改动、源输入 SHA-256、每个制品文件 SHA-256、总制品 ID、Node/OS/浏览器、失败视口、容器和失败前动作。

`ORBIT_URL` 指向外部页面时，报告的 build 为 null，明确无本地构建证明，不把当前 checkout SHA 冒充部署版本。正常本地构建前后核对源输入和 revision 未变化。构建身份包括源、配置、锁文件和实际 dist 字节；文本源与 driver 指纹规范化 CRLF/LF，制品仍按原始字节计算。复现先核对 SHA/源，再重建并核对制品 ID，版本不匹配时在浏览器用例开始前拒绝。

在隔离、干净的对应 SHA 工作树安装冻结依赖后，从游戏目录运行：

```sh
node tests/reproduce-failure.mjs <absolute-browser-report.json>
```

脚本只运行固定的 Orbit driver，不执行报告里任意命令文本。普通失败重跑完整专项；可控 pageerror 只在显式设置 `ORBIT_DIAGNOSTIC_PROBE=pageerror`（独立）或 `iframe-pageerror`（sandbox iframe）时注入独立测试脚本错误并立即失败。`ORBIT_DIAGNOSTIC_VARIANT=B` 仅允许与 probe 一起使用，使用 Vite 的 `/orbit-diagnostic-b/` base 构建第二份不同制品。两者都记录于报告供固定复现；默认测试无故障注入。probe 用来验证收集与版本绑定，不代表发现了游戏 bug。HTTP 失败按资源路径/状态/容器比较，本机随机端口被规范化，不影响重跑签名。

无需 source map：报告保留生产脚本文件名及栈中行列，匹配制品可重现，必要时用对应源码定位。未生成或上传 map；hidden map 也不当作保密方案。

采集只使用新建的合成测试 profile，不读取真实用户 profile、凭据、请求头/正文、console 内容或存档值。URL 去用户名/密码、query/hash；常见 token/secret/password 与 Authorization/Cookie/Bearer 值脱敏；本机用户路径替换并保留栈文件名与行列。每个错误 message 最多4000字符、stack 最多16000字符，最多20个错误，最近40个动作；动作只记录固定操作名、视口和手势首尾坐标/点数。截图保持原固定有限集合。默认输出在忽略的 `.scratch` 中，局部测试产物可删除；发布候选临时树仍遵守已有生命周期，精选无敏感信息的诊断样例可按 SHA 归档。CI 失败打印有界 JSON 到既有 job log，不新增服务或 artifact 权限。

增量门禁仅把 `browser.mjs` 接入已有 Orbit publishing 专项列表，仍由真实受影响游戏 ID 选择；规则自测接入 Orbit `test`。未增加全量推送检查。线上 CI/Pages、真机和原生平台结果分别记录，Chromium/CDP 与合成生命周期事件不能称作真机验收。
