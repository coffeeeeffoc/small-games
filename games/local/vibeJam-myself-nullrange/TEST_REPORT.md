# B1 Cocos工程与规则验证

日期：2026-10-29；Windows，Node 24.21.0 / pnpm 12.6.0，真实 Cocos Creator 3.8.8，Playwright 1.55.1 Chromium。工作树为 C:/Users/15211/.codex/worktrees/nullrange-rebuild/small-games，分支 codex/nullrange-rebuild；本批未提交、未推送。

最终源码摘要：`dff80491a9c6d41115ac0b2038887cda16c86f6f7195f765bc25ad70c4e12426`。制品 `dist/build-info.json` 记录Creator版本、稳定Game ID、声明摘要及44个运行文件的SHA-256；完整目录45个文件约3.22MB（未压缩）。原始真实声明位于忽略的 `cc.d.ts`。本摘要属于运行源码/工具输入，不是Git提交身份。

完整浏览器与预构建复用证据保留原摘要 `7191efc6b08baa0b39e425f1a523aa7f31f30e8b8f9a989a23ad8aa498901c81`，没有改标旧证据。P2修复只改存档合并、两处保存调用及测试；按主会话要求复用未变化的飞行、输入和UI导航证据，不重复完整浏览器。下表的类型检查/Creator构建日志已更新到最终候选，其他前序验证保留其证据身份。

## P2存档覆盖修复与定向复测

`saveProgress(storage, progress, field)` 强制区分 `best` 与三个偏好字段。保存前重新读取并验证最新记录；结算只取最大分数，显式偏好只patch单字段，成功后同步最新状态到当前页面。读取失败拒绝写入，恢复后不把默认偏好写回。

实际执行 `node --test games/local/vibeJam-myself-nullrange/tests/progress.test.mjs games/local/vibeJam-myself-nullrange/tests/progress-concurrency.test.mjs`：4项通过，见 `reports/progress-test.log`。覆盖双标签页三个偏好交错修改与旧页结算、读取失败后恢复结算/改设置、合法旧best/muted、损坏/未来版本保护及非法字段值。随后重新执行本款typecheck与真实Creator build成功；最终构建器再次核对源码、声明和完整文件清单。

## 实际命令与结果

以下命令在上述工作树根运行，全部串行；只有本款及其现有工具链被执行。

| 命令                                                                                      | 结果与证据                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter null-range-mobile-cn install --offline --frozen-lockfile --ignore-scripts` | 成功，复用已锁定的TypeScript/Playwright；根锁文件仅本款importer变化                                           |
| `pnpm --filter null-range-mobile-cn test`                                                 | 8项通过；`reports/test.log`                                                                                   |
| `pnpm --filter null-range-mobile-cn typecheck`                                            | 使用真实3.8.8声明通过；`reports/typecheck.log`                                                                |
| `pnpm --filter null-range-mobile-cn build`                                                | 真实Creator Web Mobile构建成功；`reports/build-command.log`、`reports/build-web-mobile.log`                   |
| `node games/local/vibeJam-myself-nullrange/tests/prebuilt.mjs`                            | 实际制品复制复用、环境变量构建/类型检查通过；篡改入口、伪造声明及新增未登记文件均拒绝；`reports/prebuilt.log` |
| `pnpm --filter null-range-mobile-cn test:browser`                                         | 12项通过，0页面/资源错误；`reports/browser-command.log`、`reports/browser/report.json`                        |
| 直接调用锁定Prettier（显式忽略根目录导入游戏排除规则）                                    | 本款新增源码/测试格式化；`reports/format.log`、`reports/format-tests.log`                                     |
| `git diff --check`、定向路径/开发模式副本审计                                             | 无空白错误；仅授权路径变化，开发模式副本与共享源一致；`reports/final-audit.log`                               |

首次导入由Creator补齐资源bundle元数据和工程设置，源码摘要检查拒绝首次漂移的制品；规范化后重新构建成功，没有放宽校验。浏览器定位并修复了Creator对Map迭代器数组展开的编译差异，实际输入使用Array.from。

## 规则与真实输入证据

纯规则通过正常操纵输入，在相同种子下可复现完整胜利；覆盖前向/距离/死亡目标锁定限制、移动目标与高速弹道相对扫掠、一发不重复击杀、热量锁定/冷却、护盾优先/碰撞保护/恢复、加速能量、导弹冷却、扫描回收一次性计分、正常失败和新局复位、旧best/muted迁移、坏存储与较高成绩保护。

浏览器使用手机UA和真实触屏/键盘事件，`__nullrange.snapshot()` 仅在开发模式暴露深拷贝，不能修改局面；没有直接改血、删敌、跳关或操纵时钟。

- 最新胜利：447个固定步（7.45秒），击落3架、回收2个、900分。`reports/browser/victory.png` 和报告中的完整终局state对应同一运行。
- 最新失败：329个固定步，原因“撞击地形 · 保持高度”，机体0；持续真实俯冲产生，随后重开恢复完整机体和任务。`reports/browser/failure.png`。
- 667×375、844×390、932×430、390×844：真实Cocos点击单机/玩家对战/返回/开始/暂停；热区≥44 CSS px。竖持首启及由横转竖的整画布和触点均检查。
- 双指摇杆+开火、原生touchcancel清理；失焦清空输入并冻结步数；设置保存/重载、返回暂停；开发试玩没有写入最高分。
- 同源iframe的真实子页面发出三字段Shell沉浸契约（type/gameId/screen），游玩/暂停设置为playing，返回机库为home。此测试不是完整Shell应用验收。

Chromium在CDP原生touchcancel时报告1条已知诊断：Creator 3.8.8的 `pal/input/web/touch-input.ts` 无条件preventDefault，浏览器拒绝取消不可取消的事件。报告 `engineDiagnostics` 完整保存这条精确文本；触点归零断言仍通过。其他console error、pageerror和HTTP资源错误均严格失败。未修改引擎。

## 视觉、范围与交接

已查看四尺寸首页、战斗、暂停、胜利、失败截图，航空色板与页面流程为全新Cocos实现；与概念图相比，精细战机、山谷、材质、完整图标与页面细节仍明显缺失，**视觉未通过**。B1几何仅为已授权技术阶段。任务时长约5–8秒是自动驾驶证据，不代表2–5分钟目标或普通玩家体验。

- B2：`World.MODEL_PATHS` 对接 `resources/models/player`、`drone`、`valley` Prefab。原点中心、米制、机头-Z、Y向上；碰撞仍属纯规则。
- B3/B4：完成精细UI、机库、真机安全区和操作感、六任务/三敌型/机体及节奏。B5新增通用服务Duel适配，核心无Cocos依赖；本批没有后端。
- B6：八类正式资料尚未齐备，见 [publishing/STATUS.md](publishing/STATUS.md)；没有以概念图或技术截图冒充最终素材。
- 共享整合已经完成，补充验证如下；完整改动以本批Git diff为准。

未运行全库、完整Shell、准确提交候选验证、CI/Pages、原生渠道、真实手机/Safari/广告/远端联机；本地证据不表示发布成功。临时浏览器与预览服务在测试finally关闭，构建制品与日志保留供主会话复核。

2026-09-12的旧TEST_REPORT描述历史Web原型，不适用于当前工程；原始证据可在Git基线 `8c4c821addb627e4196ccdc0b9437475e4b60f47` 找回。

## B1共享消费者整合

Creator矩阵扩展到12款，预构建变量、复用验证、CI/Pages/Android/iOS下载路径和Turbo已对应。Shell采用真实Cocos触控与只读快照，不保留旧游戏DOM契约。

- 共享Node契约45项通过；游戏配置35项通过、Windows符号链接权限用例1项跳过。
- Shell独立入口/沉浸113项通过，类型检查与Pages模式构建通过；零域实际Pages手机横竖屏、词屿/乌龙城导航样本通过。
- 开发模式副本检查39款0问题；零域与乌龙城各10项浏览器检查通过。当前`dff80491…`制品校验通过，未把旧`7191ef…`完整游戏浏览器证据改标为新构建。
- 新增Nullrange迁移范围测试、Tetracube保留契约共3项通过。实际完整diff的临时Git候选覆盖91路径、10个删除及2个R100移动；额外删除、错误目标负例拒绝。日志：`reports/shared-wiring/full-diff-selector.log`。
- 四条准确Creator工具引用已声明；定向边界正负例通过，实际workspace边界/循环检查通过。
- 象五子棋按仓库锁定gitlink初始化；其构建契约2项、实际构建、Shell嵌入/返回和390×844触屏样本通过，未修改子模块版本或源码。
- 三个历史范围fixture失败在B0测试/实现模块下同样复现，保留`reports/shared-wiring/b0-historical-fixtures.log`，未放宽规则或宣称整份历史测试通过。

本批仍为技术基础，完整视觉、六任务、玩家对战和正式素材继续按B2–B6推进。远端CI/Pages和真机结论独立记录。
