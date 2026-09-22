# 卡丁车好友联机

Node.js 24.12+ / TypeScript 服务，复用游戏的物理、检查点、排名和机器人逻辑。客户端只上传操作，服务端以 60 Hz 模拟、20 Hz 广播状态。一个房间最多 8 辆车，房主可选 0–7 个机器人；每场重新随机机器人的车型和车手。

## 本机运行

在仓库根目录执行：

```powershell
pnpm install
pnpm --filter @coffeeeeffoc/carding-car build
pnpm --filter @coffeeeeffoc/kart-server start
```

浏览器打开 `http://127.0.0.1:43003/play/`。在车库选好默认组合，再点“好友联机”创建房间。房主可在大厅修改主题、路线、赛车和车手，所有真人车手采用这套选择；机器人的外观每场随机。好友从邀请进入后只需确认加入，也可以手动输入房间码。修改配置会取消所有人的准备状态，全部加载完成并准备后由房主开始。开发时可用 `dev` 代替 `start`，源码变更会重启服务并清空房间。

## 没有服务器：国内公网隧道

电脑保持联网、不休眠，同时运行本服务和隧道客户端即可。不需要路由器端口映射。只转发 `127.0.0.1:43003`，同一端口提供 `/play/` 游戏页面、`/kart` WebSocket 和 `/health`。

截至 2026-09-20 官网公布的方案：

- [cpolar](https://www.cpolar.com/pricing)：免费 1 Mbps、随机公网地址；[文档](https://www.cpolar.com/docs)支持大陆 `cn` 区域和 HTTP 隧道中的 WebSocket。适合先试两人联机，多人和首次资源下载可能受带宽限制。
- [樱花 FRP](https://www.natfrp.com/)：普通用户 10 Mibps、2 条隧道、每月 5 GiB，签到可领取额外流量。带宽更适合多人，但[实名认证收取 1 元](https://doc.natfrp.com/faq/realname.html)，不是完全零支出；[内地 HTTP(S) 节点要求备案域名](https://doc.natfrp.com/app/http.html)。按节点规定选择 HTTPS 入口及本地 HTTP 转发，不要将未加密的本服务直接接到要求本地 TLS 的 HTTPS 隧道。

以 cpolar 为例，注册并在其客户端完成账户配置后，在一个终端运行：

```powershell
cpolar http -region=cn 43003
```

复制客户端给出的 **HTTPS** 公网地址，停止之前的 `start`，在另一个终端运行（替换示例域名）：

```powershell
pnpm --filter @coffeeeeffoc/kart-server share https://你的隧道域名
```

`share` 启动游戏服务并允许该网页来源；它不登录或启动隧道客户端。若已在本机 `release-config.local.json` 的 `multiplayerServerUrl`（或 `KART_SERVER_URL`）配置公网 WS(S) 地址，普通 `start` / `dev` 也会读取同一地址并允许其 HTTP(S) 网页来源，不必每次手填域名。打开公网 `/play/` 地址创建房间，点击“邀请好友”复制包含房间码的链接。若浏览器不允许复制，手动分享当前公网游戏地址和房间码。域名变化后更新本机配置并重启，或用新地址重新运行 `share`。

### Sakura FRP 固定端口

本服务默认固定监听 `127.0.0.1:43003`，忽略其他开发工具留下的通用 `PORT`。FRP 的本地目标保持 `127.0.0.1:43003`；端口占用时启动失败并明确提示，不会自动尝试下一个端口。只有显式设置 `KART_SERVER_PORT` 才改变端口，此时必须同步修改 FRP；所有启动命令使用相同规则。公网 URL 的端口是中转端口，不是本机监听端口，不能直接照抄到 FRP 本地目标。

连接中断时先检查 `http://127.0.0.1:43003/health`，再检查公网 `/health`。本机正常而公网失败通常需检查隧道；两处健康检查正常但浏览器 WebSocket 失败，还应检查该页面的完整 origin 是否在允许列表。普通 `start` 比 `dev` 更适合持续联机，后者会因源码改变而自动重启、清空房间。此修复不会替代电脑常开、不休眠和隧道在线的要求。

隧道的 HTTPS/WSS 在中转处终止，再转发给本机 HTTP/WS。免费节点实际延迟、拥塞和流量额度需实测；未在此仓库中存放隧道账户或密钥，也没有代办注册、实名认证或公网验收。

## 小游戏与独立 H5 部署

`games/local/carding-car/assets/resources/multiplayer.json` 的 `serverUrl` 可填写 `wss://你的域名/kart`，然后重新构建目标平台。浏览器也可以用 `?kartServer=wss%3A%2F%2F...%2Fkart` 覆盖；本服务的 `/play/` 页面默认自动使用当前域名，无须改包。

微信小游戏正式环境需要在平台后台配置 socket 合法域名，参考[官方网络示例说明](https://github.com/wechat-miniprogram/minigame-demo)。随机变化的免费域名适合 H5 联调；小游戏发布宜使用可配置的稳定域名。微信/B 站原生包的“邀请好友”调用平台分享，发送小游戏卡片，携带房间码、主题、路线、赛车、车手。冷启动和后台返回均会读取邀请；先确认加入，再展示大厅。旧邀请中的选择只用于首次加载，加入后以服务器最新配置为准。H5 仍复制网页邀请链接，不会自动跳转成小游戏。

原生包优先从本机 `games/local/carding-car/release-config.local.json` 的 `multiplayerServerUrl`（或构建时 `KART_SERVER_URL` 环境变量）注入 WSS 地址，例如 `wss://your-domain:29549/kart`。不需要把私人的中转地址提交到仓库。平台分享桥接位于 `platforms/kart-sharing.js`，由构建脚本注入，游戏代码不直接调用 SDK。

微信测试步骤：

1. 使用自己的小游戏 AppID 构建并在微信开发者工具中上传 `games/local/carding-car/build/wechatgame`，在公众平台把上传版本设为体验版，添加好友为体验成员。
2. 公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名 → 修改，在 **socket 合法域名** 中填 `wss://your-domain`。此处不填端口和 `/kart`；实际连接仍用完整 WSS 地址。域名需满足 ICP 备案和有效证书要求，免费隧道子域名能否保存需以后台校验为准，见[微信网络要求](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.html)。
3. 你和好友先用手机扫码打开体验版。创建房间后点击“邀请好友”，发送小游戏卡片；好友点击卡片确认加入，不需要口述房间码或密码（当前没有另设密码）。右上角菜单也已注册相同分享参数。
4. 两台手机验证冷启动入房、后台返回入房、房主切换选择同步加载、准备开赛。开发者工具/SDK 模拟测试不能代替微信真机验收。电脑、Node 服务和隧道应保持运行。

小游戏启动只加载所选主题、路线、本人赛车和车手的独立分包；邀请首次按卡片选择加载；其他车型、车手和场景按选择加载，比赛才装配机器人和道具，音效在首次操作时加载。已加载资源复用，H5 静态资源支持 gzip 与 ETag 条件缓存。

环境变量：`KART_SERVER_PORT`（43003，替代旧 `PORT`）、`HOST`（127.0.0.1）、`KART_MAX_ROOMS`（16，最大 100）、`KART_ALLOWED_ORIGINS`（逗号分隔的完整网页 origin，无路径）。未设置来源列表时，优先从 `KART_SERVER_URL`、其次本机发布配置读取服务地址，并允许其网页来源及当前服务端口的 localhost/127.0.0.1 页面；两者均无配置才保持仅本机网页模式。显式的 `KART_ALLOWED_ORIGINS` 覆盖自动来源，空字符串表示仅本机网页模式。其他独立 H5/合集页面（例如 GitHub Pages）仍需明确加入其 origin；不会放开任意网页来源。原生无 Origin 连接沿用既有支持。

## 范围与验证

房间保存在单进程内存，重启即结束；不需要 PostgreSQL。断线后有 30 秒凭证重连窗口，超时操作自动刹车；加载等待最多 60 秒；单场最多 10 分钟，首位冲线后最多等待其余车手 60 秒。房主离线时移交给在线好友。房主在赛后点击“再开一场”返回准备大厅。联机成绩不写入本机单人纪录。

邀请房间采用访客身份，不包含账号系统、公开匹配或跨进程扩容。谁获得房间码谁可在开始前加入；重连凭证仅单独发送给本人。

```powershell
pnpm --filter @coffeeeeffoc/kart-server typecheck
pnpm --filter @coffeeeeffoc/kart-server test
pnpm --filter @coffeeeeffoc/carding-car test
# 保持本服务运行，且先构建最新 Web 包：
node games/local/carding-car/tests/multiplayer.mjs
```

浏览器脚本使用系统 Chrome，验证两个真实 Cocos 客户端的建房/加入、零机器人、统一房主配置、独立控制、共享比赛状态、刷新重连及返回单机。服务端测试覆盖权限、机器人容量、准备/加载屏障、伪造操作拒绝、结束/再来一局、房间回收和连接限制。

2026-09-22 启动修复验证：旧版进程实测受通用 `PORT` 影响改用其他端口，且普通启动的公网来源建房出现 `ECONNRESET`；新增启动回归在旧版均失败。修复后服务测试 5/5、类型检查通过，包含端口占用不得换端口、明确配置的公网来源建房及无关来源拒绝。实际以 `PORT=49999` 启动仍监听43003，读取本机发布配置；经既有 Sakura FRP 入口的同机双浏览器建房/加入、独立驾驶、状态同步、刷新重连及离房通过，页面错误为空，测试结束房间数0。这不是两手机、原生平台或长时隧道稳定性验收；不能据此断言所有间歇性网络问题都已消失。本轮原始日志保存在本机 `.scratch/six-games-95/kart-startup-*` 及 `kart-server-fixed-start.log`，未提交私人隧道地址或账号信息。

按需加载、邀请确认、输入框缩放、房主修改四项选择及旧邀请同步：`node games/local/carding-car/tests/loading-invitation.mjs`。
