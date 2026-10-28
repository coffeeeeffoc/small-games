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

B1交付：实现提交 5d0d0924，正常合并远端 eaed23d3 后候选 35587c10b510fb22123fc9a0697bf6b8d0b00e21 已推 dev；合并后的完整增量selector、workspace边界、真实制品指纹复核通过，游戏源码指纹仍为 dff80491…。B1未运行全仓候选或宣称CI完成。

## B2 本地三维资产接入与交回（2026-10-29）

本节是当前证据，前述B1记录保留历史身份。B2基于已推送 `35587c10b510fb22123fc9a0697bf6b8d0b00e21` 的指定worktree，仅修改游戏目录与总计划；未提交、未推送。主会话已有两条B1push记录保留，`UI.ts` / `FlightInput.ts` 未修改。B2完成后交还仓库写入权，后续UI/视觉由B3收敛。

当前 `dist/build-info.json`、浏览器报告和归档截图共同对应 sourceHash：`32544a280a10dd63b7d02ca2b4dceed7419a9fdbe781598c76214e98e5b1003a`。真实Creator 3.8.8 Web Mobile制品91个登记运行文件、11,021,175字节（不含build-info本身，未压缩），含完整逐文件SHA与真实声明哈希。`.py`、effect等文本统一LF参与源码摘要，生成器清单的sourceHash也对LF归一化，避免跨平台换行误报；资产/可编辑源的字节仍真实参与指纹。没有放宽导入漂移或预构建门禁。

### 实现与资源证据

- 原生 `resources.load('models/<name>/<name>', Prefab)` 实际加载17个原创GLB、5张纹理（原图PNG + 3张albedo JPG + 共享normal PNG）；17模型合计25,000三角面、3,131,924字节。细化Falcon为4024三角面/7种PBR材质，保留舱框、面板缝、翼面分色和双喷口；喷口与火焰坐标一致。来源/哈希/编辑源见 [art/README.md](art/README.md)。没有下载Hyper3D。
- 递归3D layer、共享网格/材质，使用 `Material.copy` 的宏覆盖实际启用GPU实例化；林块每块10树、距离LOD/裁切，静态对象按世界格子稳定放置与回收。暂停时模型实例累计数不增长。
- 49块地形采用同一20m格子的三角插值；绿地/层理岩石/雪线由PBR表面混合。不可到达的全景与远山不进入可玩碰撞区域；近中景为实际三维地形/树林/岩石。天空专用无雾effect，偶数次镜像闭合与夹取边缘消除了初版倒置、矩形色差和细缝。
- 首页改低角度3/4机身展示，保留天空/山谷/月亮。原UI在窄屏仍遮住部分机体；没有修改UI把这一差距藏掉。
- `NullRange.ts` 仅增加只读world统计、成功加载后撤去原加载页，以及加载未完成时拒绝开始；资源失败沿用已有45秒重试。未改存档、权威时钟或奖励。

### Pauli审查的两项P2

1. **翼尖穿山**：按当前Falcon边界对中心、双翼尖、机头、尾翼与喷口下侧做8点采样；纯函数严格匹配Cocos的YZX姿态变换。审查坐标 `(350,171.883612,-308.466667)` 现在触发地形伤害、护盾由70降为35，反弹姿态后再次计算机体净空，所有探针保留至少2.5m余量。
2. **追尾相机埋地**：纯 `cameraView` 将最终位置限制为地形/林岩体积上方6m，并检查机体到相机的视线，必要时缩短跟随距离。审查第1471步坐标与连续操纵轨迹均有回归；不改变模拟状态或时钟。

### 实际命令与结果

检查串行执行，只覆盖本游戏；未重复无关全库或B1存档专项。

| 命令                                                                                            | 结果                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D:/setup/Blender/blender.exe --background --python art/build_environment.py`                   | 实际导出16个环境/敌机模型与可编辑源；`reports/b2-model-export.log`                                                                                   |
| `D:/setup/Blender/blender.exe --background --python art/build_falcon.py`                        | 实际追加细化Falcon、源与清单；`reports/b2-falcon-export.log`                                                                                         |
| `D:/setup/Blender/blender.exe --background --python art/bake_surfaces.py`                       | 实际烘焙4张有效贴图；`reports/b2-surface-bake.log`                                                                                                   |
| `pnpm --filter null-range-mobile-cn test`                                                       | 接入早期15项通过（含原有存档/制品契约）；后续只重跑受影响项目                                                                                        |
| `node --test tests/flight-geometry.test.mjs tests/assets-terrain.test.mjs tests/rules.test.mjs` | 最终14项通过，GLB有效载荷/索引/法线/UV/边界/预算/来源、地形三角一致、机体/相机P2及真实操纵规则；`reports/b2-terrain-regression.log`                  |
| `pnpm --filter null-range-mobile-cn typecheck`                                                  | 最终真实cc.d.ts检查通过；`reports/b2-typecheck.log`                                                                                                  |
| `pnpm --filter null-range-mobile-cn build`                                                      | 最终真实Creator构建通过；`reports/b2-build-command.log`、`reports/build-web-mobile.log`。首次GLB导入及更换主机引发的meta漂移均先被拒绝，再规范化重建 |
| `pnpm --filter null-range-mobile-cn test:browser`                                               | 13项命名检查与4组视口数据通过；0页面/HTTP资源/非豁免console错误；`reports/b2-browser-command.log`、`reports/browser/report.json`                     |
| `node tests/prebuilt.mjs`                                                                       | 实际源码匹配制品复制复用/类型检查成功，篡改入口、伪造声明、新增未登记文件拒绝；`reports/b2-prebuilt.log`                                             |
| 定向Prettier及 `git diff --check`                                                               | 仅本批路径格式化/空白检查；无UI/Input改动，无提交/推送                                                                                               |

浏览器沿用只读snapshot与真实Cocos触屏/键盘事件，没有修改state/血量/时钟：327 ticks（5.45秒）、3击落、900分自然胜利；337 ticks正常俯冲失败，原因“撞击地形 · 保持高度”，随后可重开。该速度只证明闭环，不是2–5分钟任务节奏达成。原有touchcancel精确引擎诊断保留单独记录，触点清理断言通过。

### 画面与实际渲染开销

归档 [evidence.json](docs/design/b2/evidence.json) 将以下PNG、sourceHash与运行统计绑定。已打开检查六张指定尺寸截图，对照本轮目标图；932×430额外样本保留于reports。

| 视口    | 首页                                        | 战斗                                          | 战斗draw calls / 三角面 |
| ------- | ------------------------------------------- | --------------------------------------------- | ----------------------- |
| 667×375 | [首页](docs/design/b2/home-667x375.png)     | [战斗](docs/design/b2/flight-667x375.png)     | 122 / 95,088            |
| 844×390 | [首页](docs/design/b2/home-844x390.png)     | [战斗](docs/design/b2/flight-844x390.png)     | 122 / 104,312           |
| 390×844 | [竖持首页](docs/design/b2/home-390x844.png) | [竖持战斗](docs/design/b2/flight-390x844.png) | 122 / 104,312           |

首页实测121 draw calls / 96,046三角面，67个唯一网格（含49地形网格）、29个共享材质；场景池109、当前活动renderer184，759个pass确认启用了实例化。统计来自Cocos实际gfx device，不是只按模型静态面数相加；这里是单帧样本，不是峰值预算或手机FPS证明。首轮错误调用共享材质recompileShaders时约229 draw calls，已改为copy overrides并实测下降；原始失败截图不作为验收基线。

**视觉仍未通过**：山谷断崖与层理尺度、植被自然分布、白云体积感、飞机高频细节/光影与参考图仍有差距。窄屏首页按钮挡住部分机体、战斗提示覆盖机身是B3旧UI收敛项。B2实现了真实3D和可观察的美术进步，没有把当前模块化效果宣称精确达到参考标准。Hyper3D三模型仍待用户下载指示；完整六任务、玩家对战及八类正式上架资料继续按原批次处理。

未运行全库、正式准确提交候选、CI/Pages、原生宿主、真实手机/Safari/广告或远端联机；没有发布成功结论。所有临时测试服务器已由finally关闭。最终素材/发布和B3整合交由主会话。

### 主会话整合：CI规划下载修复

B1推送后的 [CI](https://github.com/coffeeeeffoc/small-games/actions/runs/40741917586) 和 [Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/40741917669) 均在首个完整历史fetch耗尽5分钟预算，尚未进入游戏验证；CI的validation-tools双平台已通过。两处planner仅增加历史blob按需下载并将预算调整为15分钟，保留完整历史和完整当前检出、锁定子模块及原门禁。

独立网络clone实测历史索引2.61MiB、非浅仓库，完整当前检出及历史blob读取成功；即时 `35587c10..41692788`、累计成功CI基线 `8c4c821a..41692788` 的真实selector均通过。3项范围证明正反例及29项CI基线/阶段/门禁契约通过，临时检出提交pre-commit通过；相同4文件整合为 `728d7494`。这些结果不表示修复后的远端CI/Pages已经通过。

B2交付：最终候选 `01ce24b5d80ad048e000cacff5bc457fa7608dd7` 已非强制推送dev并由ls-remote确认，准确base `35587c10b510fb22123fc9a0697bf6b8d0b00e21`。整合后实际增量selector、workspace边界和当前32544a28…制品校验通过；没有重跑无关游戏或将这些检查等同完整候选/远端流水线成功。下一批B3继续重做手机UI并收敛视觉。

## B3 中间交接（2026-10-29）：视觉未通过

**已交还唯一canonical写入权给主会话，停止继续改代码/重跑。没有提交、推送或派生角色。** 工作仅在 `C:/Users/15211/.codex/worktrees/nullrange-rebuild/small-games` 的游戏目录与总计划内；保留主会话先前未提交的B2推送记录。按用户最新要求结束本轮，复杂地形/材质、B3视觉验收与发布由主会话接手。

本轮中间候选 sourceHash：`76ecd618c5a1292f2b0648c67121fcff25126282115ececb7b839fd40883cde5`。真实Creator 3.8.8构建于2026-10-29 04:22完成；同hash浏览器报告时间 `2026-10-28T20:24:10.197Z`。代表性截图及摘要见 [evidence.json](docs/design/b3/evidence.json)，逐页状态及差项见 [B3说明](docs/design/b3/README.md)，[并排对照](docs/design/b3/comparison.html)使用未修改的原概念图。只归档14张真实代表图，其他中间图留在忽略的 `reports/browser/`。

### 已完成行为与文件交接

- `assets/scripts/UI.ts`：全部使用Cocos Graphics/Label，重做首页、真实任务卡、Falcon准备、HUD、窄暂停卡、设置/帮助、真实胜败结算和对战未开放恢复页。首页按钮避开主机；实际雷达、两竖条暂停、圆形双拇指控件、向量图标、冷却/不可用/热量反馈。保留稳定控件ID及Shell调用；只展示当前真实的一关/一机体。星级依据完成与机体余量，不捏造奖励。
- `assets/scripts/core/presentation.ts` 及meta：纯安全区坐标转换/边界、活敌机航向相对雷达投影、结算星级；`tests/presentation.test.mjs` 对旋转、不对称边距、雷达及确定音效留小测试。
- `startup/host.js`：隐藏CSS env测量探针，合并Creator `sys.getSafeAreaRect(false)`，不是DOM游戏覆盖层。没有浏览器全屏。`NullRange.ts` 接入prepare、独立展示镜头状态、只读safe/audio快照；补上物理window resize清理，解决横竖互换时逻辑画布大小不变而残留触点的问题。暂停→设置→返回仍暂停，恢复不补算时钟。
- `scripts/sound-bank.mjs`、`prepare.mjs`：单一生成器替换旧单音，10类原创PCM共427774字节；`NullRange.ts` 用可停止的独立AudioSource处理静音/后台/退出清理，发射/命中/其他/引擎音量分别为0.19/0.24/0.34/0.16。生成自检和浏览器清理通过，**未做实际听感验收**。
- `scripts/typecheck.mjs`：验证prebuilt或找到实际编辑器声明后复制真实声明至游戏根 `cc.d.ts`。`tests/artifact.test.mjs` 读取root或显式prebuilt声明，不再动态import带spawn的toolchain。`tests/prebuilt.mjs` 增加删除根声明→缓存typecheck恢复→下一test步骤无编辑器/无prebuilt变量的检查，原源码/声明/manifest篡改负测保留。
- `scripts/build.mjs`、`startup/icon.png`、`publishing/icon/nullrange-icon.png`：接入主会话正式无字图标。独立读取1254×1254、PNG RGB无alpha、2371280字节，SHA256 `e6ce6d4ad1c7f420179bd8260cea0d8d2c841127165a8e5c5387960812b049fa`；原文件未改。
- 已保留的视觉中间改动：`World.ts`、`alpine-terrain.effect`、新增 `exhaust/lake/ridge.effect` 及meta；`art/build_forest.py`、`build_ridges.py`、对应blend/清单、枝簇源图、总manifest；5个pine/forest与2个ridge GLB/meta。保留原GLB纹理flags、MASK双面叶片、渐变尾焰、展示镜头与布光、装饰水面/远景shader。**这些是未验收中间实现**，不是视觉达标。B2 `core/terrain.ts`、`flight-geometry.ts`、核心胜负和时钟没有改动。
- `tests/assets-terrain.test.mjs` 验证新资产generator/贴图/alphaTest及林块包络仍在既有碰撞体内；`tests/browser.mjs` 验证所有页面与安全区/生命周期。README、art说明、上架状态/文案及总计划已更新。未编辑Shell或其他共享源码。

### 本轮实际验证

以下在游戏目录串行执行；均为本候选结果，不是全仓或远端发布结论。

| 命令                                                                                            | 结果与日志                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D:/setup/Blender/blender.exe --background --python art/build_forest.py`、`art/build_ridges.py` | 实际生成模型/编辑源及清单；最终17GLB合计29104三角面、4139680字节                                                                                           |
| `pnpm typecheck`                                                                                | 真实Creator声明检查通过，`reports/b3-typecheck.log`                                                                                                        |
| `pnpm build`                                                                                    | 真实Creator 3.8.8 Web Mobile通过，`reports/b3-build-command.log`；首次新资源导入漂移被正常拒绝后重建，未削弱指纹门禁                                       |
| `pnpm test`                                                                                     | 23/23通过，0跳过，`reports/b3-test.log`；包括规则、存档、机翼/相机、资产、表现和制品                                                                       |
| `node tests/prebuilt.mjs`                                                                       | 实际构建/类型制品复用通过；根声明缺失可恢复，下一test步骤无安装编辑器且无prebuilt环境变量通过；入口篡改、伪造声明、额外文件拒绝，`reports/b3-prebuilt.log` |
| `node --test tests/artifact.test.mjs`                                                           | fresh typecheck后通过；另在无效COCOS_CREATOR且未设置prebuilt变量时通过，`reports/b3-artifact-fresh.log`、`reports/b3-artifact-cache.log`                   |
| `pnpm test:browser`                                                                             | 四尺寸及全页面真实输入通过，`reports/b3-browser-command.log`、`reports/browser/report.json`                                                                |
| `node reports/b3-shell-consumer.mjs`                                                            | 直接调用未改的Shell `assertNullrangeGameplay`，独立页/iframe各自横竖屏导弹、暂停、返回通过，`reports/b3-shell-consumer.log/json`                           |
| `node reports/b3-archive.mjs`                                                                   | verifyPrebuilt再次通过，绑定同hash报告/消费者/14张PNG与日志摘要；只生成中间证据                                                                            |

浏览器覆盖667×375 / 844×390 / 932×430 / 390×844；生产dev=0没有调试快照，dev=1快照保持脱离状态的只读副本。各页面触控热区至少44 CSS px且成对不覆盖；CSS不对称测试注入仅改变物理边距（上7/右13/下19/左31px），检查旋转映射与边界。真实CDP多点触控、cancel、拖出、冷热旋转、blur/pagehide/focus保持输入清理/暂停，音频清理断言通过；设置返回不自动开战。原有精确touchcancel引擎诊断2条单独保留，页面/HTTP/其他console错误为0。

胜败均由真实键盘/触屏pilot驱动，无state/HP修改、跳关或假时钟：327 ticks、900分、3击落、2回收、机体100自然胜利；337 ticks撞地失败、随后可重试。约5秒通关仍是B4节奏差项，不是2–5分钟目标达成。

实际加载17GLB与5张显式纹理，叶片内嵌纹理/alphaTest宏真实开启；49地形网格、68总网格、29材质。首页样本98 draw calls / 105757三角面；844×390战斗111 / 127349，667×375战斗111 / 114933。这里只是实际单帧计数，不是峰值或真机FPS达标证明。

### 未过项、共享整合与停止边界

**视觉未通过**：连续圆锥山体/光滑坡面缺岩壁和层理；水面切成不连续三角浅池，缺连贯湖谷深度；树冠偏暗且林密度不足；雪线/云雾、飞机高频细节与布光仍明显偏离目标。斑马纹和实心尾焰改善不能掩盖这些问题。UI轮廓更接近参考，字体、间距、图标及最终场景画面占比仍需主会话复核。按最新指示停止扩展World/terrain，未把本轮标成B3视觉完成。

B2远端CI `40752182151` / Pages `40752182157` 后续门禁实际失败，12项Creator成功不代表流水线成功。游戏内child_process闭包/缓存声明问题本轮已修；共享旧artifact-test→toolchain精确边由主会话删除。主会话通知外部历史fixture补丁 `81a724ff` 126/126通过，由主会话合入；实现者未修改共享fixture、未将该外部结果冒充本轮实测。

未验证真实手机/Safari/原生宿主安全区、设备性能或听感；未做完整Shell构建、全库、准确提交候选/远端CI与Pages、真实后端或平台上传。未使用Hyper3D、NASA候选月面、B4新机体；八类正式素材仍不齐。最后仅保存交接文档，遵照停止指令不再运行格式/测试或更改代码。临时浏览器与服务器由测试finally清理；中间制品和日志保留供主会话接手。

## B3主会话环境与复核修正（2026-10-29）

本节覆盖上述中间交接后的变化。sourceHash `51f25c568b4409feb0b24934d9ce6b3f06d61e99a8d49a9e6757fbdcb0dbab7c`，逐页图与哈希见 [B3场景证据](docs/design/b3-scene/README.md)。

- 新连续河道共享18m水位与机体/相机/敌机/弹道碰撞；河岸连续性、三角插值和碰撞自检通过。侵蚀山体、三平面岩纹、树林近远LOD、NASA月面均为实际资源引用。
- Carver只读复核的两个P2已修：Web物理边距只旋转一次，不再与Creator未旋转边距合并；制品测试无根声明时回读真实安装声明，保持纯数据依赖，不重引入child_process。
- `node scripts/typecheck.mjs`、真实Creator构建通过；首次GLB/纹理导入引起meta变化时指纹门禁拒绝，重建后通过。
- `node --test --test-concurrency=1 tests/*.test.mjs`：25/25，0跳过，`reports/b3-scene-tests.log`。
- `node tests/browser.mjs`：四尺寸全页面、安全区两个读取端同时非零、触屏组合/取消/失焦/旋转/前后台/同源iframe通过，`reports/b3-scene-browser.log`。0页面/HTTP/非豁免console错误；正常输入451 ticks、900分自然胜利，另有自然撞地失败；仍远短于2–5分钟目标。
- `node reports/b3-shell-consumer.mjs`：未改的Shell实际断言，独立/iframe横竖屏导弹/暂停/返回通过；`reports/b3-scene-shell.log`。
- `node tests/prebuilt.mjs`：完整真实制品复用、类型/下一步骤缓存及所有篡改拒绝通过；`reports/b3-scene-prebuilt.log`。另将根cc.d.ts暂存后直接artifact.test成功、随后恢复；纯测试依赖闭包通过。
- 当前workspace边界与环检查通过；删除旧test→toolchain许可后该项旧正例正确失败，改为拒绝契约后针对性通过，其余22项此前通过。两个历史夹具补丁35823035在外部同版本仓库126/126通过，不重复广泛测试。

19GLB总58,832三角面/6,304,748字节；远景山体单个18,432面，树林LOD单片120面，实际首页98,521面/86 calls，战斗86,377–92,217面/102–104 calls。预算调整由实际LOD后计数支持，不宣称真机FPS。

画面构图/自然密林/机体材质/云雾纵深仍未精确达标，保留未通过；B4/B5继续，B6最终视觉及八类素材不可跳过。未验证真机、Safari、原生宿主、听感、生产后端/平台登录或全仓候选。B2远端失败结论保留，本批远端CI以推送后的实际运行结果为准。
