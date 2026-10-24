# 一炮拆城

远距离实时双城炮战。拖动画面调仰角和转角，按住蓄力、松手发射；用独立望远镜观察落点，反复修正射击。双方都有门前炮、城墙炮和地堡炮，炮手沿实际路线转移，显示目标和剩余时间。炮台不再受击检修；发射后普通炮冷却 2.6 秒、地堡炮冷却 3.3 秒，趴下、转移和治疗时冷却继续。按住趴下会中止蓄力。

生命归零立即结束，城池完整也不会复活。撤回地堡使用有限医疗，治疗需要时间；城池主要结构全部坍塌后，普通炮停用，存活炮手撤离，此后只能使用地堡炮。实心弹和爆破弹分别计算局部破坏、范围衰减和掩体减伤。

“开始对战”连接真实权威服务，两名玩家实时互轰；8 秒未匹配安排机器人，断线保留 20 秒重连窗口，主动退出判负。服务不可用或规则版本不匹配时静默进入本地机器人练习；练习可暂停，在线局菜单不会暂停对手。当前按用户要求暂缓腾讯云部署，Pages 尚无常驻公网匹配入口。服务与客户端的规则版本均为 `duel-v2`。

[Cocos 竖屏改版与效果图](docs/design/portrait-cocos-2026-10-24/README.md) · [上架资料与状态](publishing/STATUS.md)

## 本地运行

```sh
pnpm --filter @coffeeeeffoc/game-castle-cannon build
pnpm --filter @coffeeeeffoc/game-castle-cannon serve:duel
# 打开 http://127.0.0.1:4179/play/?dev=0，两个独立浏览器会话可匹配
```

`pnpm dev` 预览已构建的 Cocos 页面（4468），`pnpm serve:duel` 同时提供页面与对战服务。独立静态 H5、Shell 和 iframe 的设置页可填写可访问的 HTTP/HTTPS 服务地址；HTTPS 页面要求 HTTPS 服务。

## 代码与校验

规则和地图：`src/duel-simulation.ts`、`duel-actions.ts`、`duel-physics.ts`、`duel-map.ts`；服务：`duel-server.ts`，采用 Node 标准库 HTTP 输入与 SSE 同步，无新增运行依赖。服务端校验协议、来源、凭证、输入序号及速率，统一模拟弹道与伤害。

旧关卡材料、外观及设置继续保存于原 Host 存档；真人、在线机器人、练习分别记录，开发试玩不保存结果，外观不影响对战数值。

```sh
pnpm --filter @coffeeeeffoc/game-castle-cannon test
pnpm --filter @coffeeeeffoc/game-castle-cannon lint
pnpm --filter @coffeeeeffoc/game-castle-cannon typecheck
pnpm --filter @coffeeeeffoc/game-castle-cannon smoke
```

浏览器脚本读取 `PLAYWRIGHT_EXECUTABLE_PATH`，未指定时使用锁定 Playwright 的 Chromium。Web 构建要求 Creator 3.8.8，或通过源码与运行文件摘要验证的 `CASTLE_CANNON_PREBUILT_DIR`。复用现有炮、人物、城楼、山石和音效；原始 GLB、生成编号和来源继续保留。

Web 采用 Cocos 原生 MeshRenderer、Sprite、Label、触屏输入与音频，手机竖屏优先；手机横持由引擎旋转整个画布并转换触点。拖动瞄准时显示预测弹道，空闲按 65% 蓄力预览，实际蓄力时实时更新。取消全屏与独立暂停按钮，返回直接确认继续或离开。本地确认期间暂停，联机对局继续。

旧 Three.js 仅用于构建时导出原有模型与材质，发行 Web 核心不包含 Three.js。`./canvas` 导出和 `build:legacy` 为现有原生宿主兼容保留，不代表原生平台也已迁移或通过真机验收；默认 Web 门禁与原生验收边界见公共发布规范。
