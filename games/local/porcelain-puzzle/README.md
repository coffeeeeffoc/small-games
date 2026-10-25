# 青花拾光

基于真实 Cocos Engine 3.8.8 的竖屏 2.5D 限时器物拼图。WebGL 场景、碎片、器物、宝宝和动画由 Cocos 渲染；菜单使用可访问的触屏控件。

## 运行

仓库使用 Node 24.21.0 / pnpm 12.6.0。

```sh
pnpm --filter @coffeeeeffoc/porcelain-puzzle dev
# http://localhost:4198，含本游戏好友房服务
pnpm --filter @coffeeeeffoc/porcelain-puzzle test
pnpm --filter @coffeeeeffoc/porcelain-puzzle build
pnpm --filter @coffeeeeffoc/porcelain-puzzle test:browser
```

`dev` 先构建再启动；更改源码后重启即可。构建产物为 `dist/`。使用 Creator 官方引擎源码的固定构建，来源、许可证和 SHA 在 `vendor/cocos/provenance.json`，构建时离线核验；不是 Creator 编辑器导出的工程，也未宣称原生平台包已验证。

## 玩法与内容

- 100款480×600透明器物成品：10种重新塑形的器型 × 10组细笔纹样，覆盖青花、山水、粉彩、青瓷、琉璃、镜面和金彩。纹样由imagegen生成，Three.js只在离线素材制作中使用；Cocos首页、宝宝抱瓶、原图、收藏和拼片共用同一WebP，按需加载。成品共约5.9MiB。
- 真实口沿、肩腹、内壁、圈足和柔和釉光替换旧矢量贴图；完整原图暂时隐藏散片，关闭后原位恢复。切割映射到成品alpha轮廓，保留原始碎片编号和邻接关系；旧局计时、位置、收藏和解锁保留。见[第三关实机](docs/design/verification/original-level3.png)及[画面说明](docs/design/product.md)。
- 100 关按主题有种子抽取且章内不重复，每关配置固定，重试/分享与好友挑战可复现；6～40 片不规则碎片，后期逐渐变小。相邻碎片正确对齐后吸附成组，支持整组拖动、双指缩放、画布平移、整理和原图。
- 每关 50 + 片数 × 4 秒，开场演出结束后计时。单人暂停/切后台保留原局并隐藏拼图。超时保留碎片，完整观看激励广告可续 45 秒，每次挑战一次；重试重置计时、提示和碎片。
- 每局 2 次提示；单人用完后可主动看广告获得额外提示，广告期间暂停。取消、失败、无广告和迟到回调不发奖。好友房不提供广告助力。
- 宝宝拥有拿起、举高、下摔、笑、探头、瞪眼、吐舌、嗦手、摸头、点头和跑动等姿态，使用图集与程序动画；随机旁观有冷却和动作去重。结束后可分享修复成果或奔向下一件器物；停留 9 秒后自动转场，分享或切后台取消自动出发。
- 收藏、解锁、辅助/独立最佳成绩与未完成局保存。分享高关卡的挑战可游玩，不能越级解锁主线；开发者操作不写正常奖励。使用统一 `SmallGamesDev` 面板。

## 好友房

`server.mjs` 提供本游戏独立的 HTTP 房间服务，运行同一纯规则核，不改变仓库其他游戏的房间协议。2～5 人，各自拼相同碎片和初始布局，统一开局、限时和下一关。服务器校验每次放手、提示、整理、回合号与序号，不接受客户端自报获胜。

完成者等待；所有本轮参赛者完成、超时或跳过后，6.5 秒结算，再统一进入下一关。主动退出立即移出，断线 30 秒后释放席位，房主自动转移，剩一人仍可继续。中途加入从下一轮参加。邀请码不包含玩家凭证；凭证只保存在当前浏览器会话。

独立启动时默认使用同源房间接口 `/api/porcelain/rooms`。静态站点可在 `room-config.js` 设置公开服务地址（独立于广告打包配置）：

```js
globalThis.PorcelainConfig = {
  roomServiceUrl: 'https://your-room-service.example',
};
```

跨域部署时服务端 `PORCELAIN_ALLOWED_ORIGINS` 设置精确来源列表，以逗号分隔。此版本房间为单进程内存存储，服务重启即失效；正式公网需 HTTPS、持续运行的进程与容量验证。静态 Pages 本身不运行 Node 房间服务，服务未配置或不可达时隐藏好友房入口，邀请链接给出提示，单人照常可玩。本次没有部署公网服务。

## 广告与宿主

复用 `platforms/h5/game-rewards.js`、`platform-ads.js` 与 `interstitial.js`，由构建复制公共实现。可用仓库 H5 广告配置工具为 `porcelain-puzzle` 注入实际广告位，或注入符合 `AdvertisingPort` 的 `PorcelainHost.ads.offer({id,reward})`。只认 `status: 'completed'`；默认无广告，不模拟播放、不免费发奖。

可选 `PorcelainHost.storage` 使用既有版本化 `read/write` 契约；没有宿主时使用本地存档，存储被禁用不阻塞游玩。`PorcelainHost.share` 可接渠道分享；H5 使用系统分享或复制公开链接。声音、画面轻震和触感分别可关闭。

## 结构与验证

| 路径                                   | 职责                                               |
| -------------------------------------- | -------------------------------------------------- |
| `src/content.mjs` / `src/art.mjs`      | 100 款器物、100 关、统一成品加载                   |
| `src/core.mjs`                         | Voronoi 碎片、精确轮廓交集、邻接、吸附、计时、恢复 |
| `src/view.mjs` / `main.mjs`            | Cocos 画面、程序动画、触屏与页面流程               |
| `src/platform.mjs` / `src/storage.mjs` | 广告、宿主、分享、房间客户端与存档                 |
| `src/rooms.mjs` / `server.mjs`         | 权威房间状态与 HTTP 服务                           |
| `tests/`                               | 规则、房间、回调边界、真实浏览器触屏检查           |
| `docs/design/`                         | 产品方案、先行效果图、实测截图与记录               |

最近一次浏览器验证为 2026-10-25，采用 Windows Chromium 140 手机触屏模拟与软件 WebGL，广告成功使用测试提供器验证契约。实际物理设备、真实广告填充、微信/抖音原生 SDK 和公网跨设备联机尚未验收。构图参考使用生成式美术；宝宝/场景图为专门生成的游戏素材，器物纹样为本项目生成式绘画，经离线三维制作烘焙。

上架基础资料、真实录屏与逐项验证见 [publishing/STATUS.md](publishing/STATUS.md)。

本次实际验证：21项素材/规则/房间/平台接口测试，覆盖100款成品、100关可见连通可解、原始碎片身份与邻接、两版旧局迁移；浏览器逐款检查收藏与拼图纹理一致，以及拼片重组保留超过99%的有效表面。真实触屏通关、原图查看、暂停、窄屏与本机好友房另见[浏览器记录](docs/design/verification/browser-results.json)。物理设备、真实广告及公网房间仍未验收。

素材修改后可运行 `pnpm --filter @coffeeeeffoc/porcelain-puzzle art:render` 重新烘焙；需要Playwright Chromium，原始纹样与提示词见[素材记录](docs/design/art-prompts.md)。普通构建复用已经检查的WebP，不依赖在线生成服务。
