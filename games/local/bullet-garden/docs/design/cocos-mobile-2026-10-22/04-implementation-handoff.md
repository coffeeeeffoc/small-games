# 实施交接 · 2026-10-22

本轮仅写 `F:/playground/playground-ai/bullet-garden-mobile/games/local/bullet-garden/**`。未提交、推送、合并，未操作平台账号或全局进程。主会话要求当前命令结束后先交还写入权，所以下列未执行项目明确移交，不记作通过。

## 当前产物状态（必须先读）

**当前 `dist/` 与 `build/web-mobile/` 是广告 mockSDK 专用配置的真实 Creator 构建，不是默认发布包。** 配置为 `taptap-h5 / fixture-bullet-garden / fixture-reward / adsEnabled:true`，配置文件在 ignored `reports/mock-sdk-config.json`。没有真实广告 ID。广告浏览器 fixture 脚本已写好，但尚未执行。

该构建 `sourceHash`：`719e5f28894c6418842d177a0aaa51528d848942d0d0733f7f98bcc693ddb6e3`。构建后只读比对 `sourceHash()` 相等。显式设置同一配置后，`verifyPrebuilt(process.cwd())` 不传第二参数验证通过；取消配置后默认 preview 正确拒绝这个包。最终集成后必须再次核对准确候选，不沿用本轮结果冒充最终候选验证。

## 已执行与证据

| 命令/检查                                                       | 实际结果                                                                                                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test tests/*.test.mjs`                                  | 最新163/163通过，含广告租约、native hide先于onShown、隐藏延后授奖、重开/离开/销毁迟到回调、失败显式结算、Windows实际临时目录与junction路径防护、严格渠道配置                 |
| `node scripts/typecheck.mjs`                                    | 最新通过；先prepare core/channel，使用真实3.8.8声明                                                                                                                          |
| `node tests/balance.mjs`                                        | 十二种正常血量流派回放全部胜利                                                                                                                                               |
| `QA_OUTPUT=.../actual/campaign node tests/campaign-balance.mjs` | 最后调参后3种种子、各14关正常赚取成长回放全部通过；见 `actual/campaign/balance-report.json`                                                                                  |
| `node tests/movement-comparison.mjs`                            | 同正常成长存档/seed42/升级选择优先级，仅改变移动输入；第2关站桩伤害6.108 vs走位0，第6关约96.33 vs0，均胜利。见 `actual/movement-comparison.json`；这是核心回放，不是真机证据 |
| `node scripts/build.mjs web-mobile`                             | 多次真实Creator3.8.8通过，最新为上方明确标记的fixture配置；详见 ignored `reports/build-fixture.txt`                                                                          |
| `node tests/cocos.browser.mjs`                                  | 默认preview生产包实跑通过，7组检查、0页面错误；见 `actual/browser-report.json`                                                                                               |
| `verifyPrebuilt`                                                | 最新fixture同配置默认参数验证通过，错误配置被拒绝，inventory与sourceHash匹配                                                                                                 |

浏览器实测为桌面Chromium触屏模拟，串行单浏览器。覆盖320×568、390×844、430×932、844×390菜单/选关/营地/图鉴/设置帮助、摇杆与冲刺多指、touchCancel、暂停恢复、失焦、resize。正常首关无存档fixture、无时间加速、无可写游戏注入，实跑60秒胜利，保存并重载后第二关解锁。另用明确的后期进度存档fixture，真实触屏拖技能/取消，并主动撞向敌人自然失败；失败页未结算，点击结束后仅提交一次，再次冒险可用。Shell同源iframe收到 `home → playing → home`。

实际截图：`actual/home-320.png`、`home-390.png`、`home-430.png`、`home-844.png`、`battle-first10-390.png`、`victory-390.png`、`failed-390.png`。`01-home/02-levels/03-battle`是首轮截图，其中旧03战区问题已经修正；采用新版 `battle-first10-390.png`。首轮站桩在画外击杀的复现日志保留在 ignored `reports/baseline-observation.json`，不当作通过证据。

浏览器通过后最后的运行时代码改动只有：快照player深拷贝，加载页使用icon并显示5张素材进度，允许广告准备中返回首页取消租约。最新fixture已真实编译这些改动，**未重跑浏览器**；后续验证不要把旧截图称为最新精确bundle验收。

## 变更文件与行为

- `assets/scripts/BulletGarden.ts`、`GardenView.ts`、`core.d.ts`，`assets/scenes/main.scene`及metadata，`settings/v2/**`：真实Cocos页面、图片Sprite、跟随相机、触控/safe area/resize、原生存储与音频资源释放。所有菜单、战斗、强化、暂停、失败和结算可达，没有全屏按钮。已修正Creator场景组件压缩UUID，生产中没有Missing class。
- `assets/resources/art/{home,actors,ground,levels,icon}.png`及metadata、`assets/resources/audio/confirm.wav`：真实图集alpha透明；新portrait地面替换同名旧地面，映射到480×640碰撞范围加小边距。icon缩为256px/147720字节，并用于原生加载页，所以仍保留5张资源；首屏/品牌另使用同一icon源。
- `src/session.mjs`、`src/cocos-core.mjs`：复用原模拟，管理页面、结算与每局广告租约。仅completed奖励，native受控hide可早于onShown，隐藏中完成到show才授予且保持暂停；取消、退出、销毁或换局拒绝迟到结果。
- `src/config.mjs`、`content-schema.mjs`、`simulation.mjs`、`progression.mjs`：稳定14关ID、关卡绑定地图；480×640边界与近处出生窗口。第2关双敌批次/较近范围，runner生命48、速度150，首关仍宽松。技能瞄准预览复用实际目标裁剪；修复Creator编译Set展开导致的资源快照/settledRuns序列化问题。旧规则测试保留，若干旧横向坐标fixture移到新合法区域，原断言继续执行。
- `scripts/{prepare,build,artifact,artifact-paths,platform-config,typecheck,serve,build-taptap}.mjs`、`startup/loading.js`、`platform-build.example.json`、根薄转发 `build.mjs`、`package.json`、`tsconfig.json`、`.gitignore`：真实构建、品牌加载/重试、严格配置、预制品防错配、Windows物理路径防擦除、纯Node安装前sourceHash。sourceHash显式覆盖工具链/branding/公共provider及两份TapTap校验helper；官方插件archive/目录/包体另外写receipt。
- `tests/{session,artifact-paths,platform-config}.test.mjs`、`tests/cocos-harness.mjs`、`cocos.browser.mjs`、`cocos-ads.browser.mjs`、`movement-comparison.mjs`、`home-browser.mjs`及受影响规则fixture：正式package浏览器入口均验证production dist。广告脚本明确mockSDK，不能称平台验收。
- `README.md`与本设计目录：运行/配置/预览/验收边界和快照契约；旧Canvas源码保留参考，不作正式入口。

Shell通知在 `BulletGarden.announceHost()`：只在Web、parent不等于self、parent.origin精确等于自身origin时发送，异常安全；home/选关等菜单报home，playing/paused/upgrade/failed/result报playing。主会话仍需接Shell immersive allowlist和根测试范围。

## 尚未执行：主会话串行命令

以下全部从本游戏目录运行，当前机器不要并行Creator/浏览器：

```powershell
# 1. 当前fixture已经构建，直接运行；明确只是mockSDK生产bundle契约测试。
node tests/cocos-ads.browser.mjs

# 2. 无论fixture测试是否通过，后续发布前必须恢复默认关闭广告包。
Remove-Item Env:BULLET_GARDEN_PLATFORM_CONFIG -ErrorAction SilentlyContinue
node scripts/build.mjs web-mobile
node tests/cocos.browser.mjs

# 3. 桌面与native，尚未执行。native默认空AppID预览，不冒用任何真实游戏。
node scripts/build.mjs web-desktop
$env:TAPTAP_PLUGIN_DIR='F:/playground/playground-ai/small-games/.scratch/taptap-local/tools/plugin/taptap-minigame-tools'
$env:TAPTAP_PLUGIN_ARCHIVE='F:/playground/playground-ai/small-games/.scratch/taptap-local/tools/tap-minigame-ts-1.2.2.zip'
node scripts/build-taptap.mjs
# wrapper内部先真实wechatgame，再官方转换，改真实manifest后重打ZIP并逐文件验证。
```

`build-taptap.mjs`已经实现官方verifyPlugin→全新mkdtemp子目录convertWechatToTap→绑定game.json.appId和project.config.json.appid→重打ZIP→<20MiB与目录一致性→哈希receipt。但本轮**没有执行**wechatgame/官方converter，不能确认其运行兼容性或最终包体。实际安装基线没有用户提到的 `packageNativeProject/checkNativePackage` 导出，所以使用已有低层 `verifyTapProject/inventory/zipInventory` 和官方converter安装的archiver依赖，未调用登录/两游戏高层封装。

后续还需主会话负责共享链路准确候选、公共广告消费者、开发模式独立/Shell/跨域全套消费者门禁。未完成TapTap真机、真实广告SDK、后台提交或平台审核。本轮未执行根全量或发布。
