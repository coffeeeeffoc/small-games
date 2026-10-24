# 13 款游戏激励广告接入验证

日期：2026-10-24。基线：`0fadabdfc6d3144f36ef9ff004e0fc14e54e3e4d`。范围为[广告接入矩阵](../operations/taptap-rewarded-ads.md)末尾的 13 款游戏；一炮拆城不在本次修改中。保留用户原有 `game-build.local.mjs` 配置并追加 13 款空广告位。原工作区其他未提交修改未纳入。

## 已验证

- Node 24.21.0、pnpm 12.6.0。8 款 Creator 游戏使用实际 Cocos Creator 3.8.8 构建并检查类型；另外 5 款运行各自的真实构建器。没有替换引擎或伪造 sourceHash。
- 13 款各生成广告关/开、后端关的 H5 ZIP，共 26 个制品。开广告测试使用明确的逐游戏 fixture ID；构建验证配置隔离、入口前注入、ZIP 文件清单及制品完整性。最终批次位于工作树 `outputs/reward-ads-validation/packages-ready`。
- 四个新增入口（星扣工坊对齐、穿云落星刹停补充、追贼别撞墙五秒保护、弹指擂台练习瞄准）使用真实 H5 包和显式 SDK fixture 触屏测试。完成只发一次；取消/失败不发；退出页面的迟到回调失效；普通失焦不取消正常播放；奖励完成后保持暂停；离线包不访问后端。
- 上述四款在 390/320 宽度截图核对。星扣工坊缩小暂停图像以留出反馈空间；追贼别撞墙同步 Cocos 渲染窗口与 HUD 尺寸，并验证缩小后可实际继续和暂停。
- 子弹花园真实 Creator 包接共享 provider，验证自然碰撞、补给/续战和广告显示前失焦。打破笼子接住人分别验证宿主注入与共享 provider，包括自然失败、重复回调、十分钟播放和退出后的迟到完成。
- 夺城令完整浏览器专项通过，包含完整观看升级、长播放、离开结果页后不修改军械库，以及触屏、横竖屏、存档拒绝和页面生命周期。
- 苔光花园 5 项扩展浏览器回归通过。原有六款奖励相关规则/会话检查 79 项通过；共享打包、范围分类、新增奖励和子弹花园会话测试另行通过。
- 子弹花园、星扣工坊、苔光花园补齐八类基础资料，分别位于各自 `publishing/STATUS.md`；实际操作录像与宣传剪辑分开，附尺寸、时长和 SHA-256。录像使用真实构建和触屏输入，无广告 fixture 或可写玩法钩子。

## 可复现入口

```sh
pnpm build:games --dry-run
node --test --test-concurrency=1 scripts/build-games.test.mjs scripts/publication-scopes.test.mjs games/local/bullet-garden/tests/session.test.mjs games/local/tower-brake/tests/rewards.test.mjs games/local/orbit-atelier/tests/rewards.test.mjs games/local/chase-thief/tests/rewards.test.mjs games/local/flick-arena/tests/rewards.test.mjs
node games/local/bullet-garden/tests/cocos-ads.browser.mjs
node games/local/cage-rescue/tests/reward-browser.mjs
node games/local/tianxia-chalu/tests/browser.mjs
node games/local/game-moss-garden/tests/expansion.browser.mjs
```

浏览器检查先构建对应游戏，并设置有效的 `PLAYWRIGHT_EXECUTABLE_PATH`。本机完整日志、实际包检查脚本和截图保存在工作树 `outputs/reward-ads-validation`；临时浏览器录像不作为正式素材提交。三款新资料的媒体清单保存实际录制构建指纹，规则与文案以本次提交为准。

## 验收边界

新增 13 款暂未取得各自应用的可核实广告位，配置留空，因此实际默认不会发起广告，普通游玩保持可用。填入对应有效 ID 后才启用广告；不能套用其他应用的 ID。TapTap 真机 SDK、真实广告填充、原生渠道包及平台提审未验证。

本轮是开发分支推送，不执行外部上传或正式上线。记录的是上述专项验证；未运行完整 `validate:candidate`。Git hooks 保留，推送使用非强制更新；CI/Pages 结果须按最终提交 SHA 单独查询，不能将本地 H5 fixture 通过视作线上或真机验收通过。
