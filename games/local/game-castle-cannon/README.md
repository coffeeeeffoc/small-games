# 一炮拆城

远距离实时双城炮战。拖动画面调仰角和转角，按住蓄力、松手发射；用独立望远镜观察落点，反复修正射击。双方都有门前炮、城墙炮和地堡炮，炮手沿实际路线转移，自动装填；按住趴下会中止蓄力并暂停装填。

生命归零立即结束，城池完整也不会复活。撤回地堡使用有限医疗，治疗需要时间；城池主要结构全部坍塌后，普通炮停用，存活炮手撤离，此后只能使用地堡炮。实心弹和爆破弹分别计算局部破坏、范围衰减和掩体减伤。

“开始对战”连接真实权威服务，两名玩家实时互轰；8 秒未匹配安排机器人，断线保留 20 秒重连窗口，主动退出判负。服务不可用时明确进入本地机器人练习；练习可暂停，在线局菜单不会暂停对手。当前按用户要求暂缓腾讯云部署，Pages 尚无常驻公网匹配入口。

## 本地运行

```sh
pnpm --filter @coffeeeeffoc/game-castle-cannon build
pnpm --filter @coffeeeeffoc/game-castle-cannon serve:duel
# 打开 http://127.0.0.1:4179/play/?dev=0，两个独立浏览器会话可匹配
```

Vite 开发入口通过 /duel 代理连接同一服务（4179）。独立静态 H5、Shell 和 iframe 的设置页可填写可访问的 HTTP/HTTPS 服务地址；HTTPS 页面要求 HTTPS 服务。

## 代码与校验

规则和地图：`src/duel-simulation.ts`、`duel-actions.ts`、`duel-physics.ts`、`duel-map.ts`；服务：`duel-server.ts`，采用 Node 标准库 HTTP 输入与 SSE 同步，无新增运行依赖。服务端校验协议、来源、凭证、输入序号及速率，统一模拟弹道与伤害。

旧关卡材料、外观及设置继续保存于原 Host 存档；真人、在线机器人、练习分别记录，开发试玩不保存结果，外观不影响对战数值。

```sh
pnpm --filter @coffeeeeffoc/game-castle-cannon test
pnpm --filter @coffeeeeffoc/game-castle-cannon lint
pnpm --filter @coffeeeeffoc/game-castle-cannon typecheck
pnpm --filter @coffeeeeffoc/game-castle-cannon smoke
```

浏览器脚本读取 PLAYWRIGHT_EXECUTABLE_PATH；Windows 默认 Chrome，Linux 默认 /usr/bin/chromium。[完整需求、效果图与验证记录](docs/design/artillery-duel-2026-10-09/README.md)。复用现有炮、人物、城楼、山石和音效，新增地堡由 Hyper3D 生成并集成；原始 GLB、生成编号和来源一并保存。

手机横屏及竖屏旋转兜底，触屏多点输入，公共全屏和统一 dev 开关。原生工程保留 Canvas fallback 和宿主适配，原生平台联网桥、开发者工具和真机仍待专项验收。
