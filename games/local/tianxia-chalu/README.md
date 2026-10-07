# 天下岔路

移动端优先的架空战国策略小游戏。自动产兵、自动行军，玩家唯一的战场操作是点击己方岔口、轮换出口；通过抢中立城、调转补给路线、观察对手远征争取优势。

## 两个子应用

| 应用         | 位置                        | 职责                                                                           |
| ------------ | --------------------------- | ------------------------------------------------------------------------------ |
| 移动端 Game  | `games/local/tianxia-chalu` | 主页、征战关卡、触屏沙盘、AI 本地对局、存档、服务端对局客户端                  |
| 独立对局服务 | `services/tianxia-server`   | 服务端固定步长模拟、访客对局凭证、改道指令校验、暂停恢复、权威胜负和战报持久化 |

Game 的纯规则通过包的 `./engine` 和 `./levels` 导出供服务复用。网络与存储不进入规则层。H5 可以单独发布，没有后端也可完成全部本地征战。服务端不是管理页面，而是实际参与对局裁定的独立 Node 应用；完整协议及部署边界见[服务说明](../../../services/tianxia-server/README.md)。

## 运行

仓库使用 Node.js 24.21.0、pnpm 12.6.0。在仓库根目录执行：

```sh
pnpm install
pnpm --filter @coffeeeeffoc/tianxia-chalu dev
# http://localhost:5198/
```

启动配套后端：

```sh
pnpm --filter @coffeeeeffoc/tianxia-chalu build
pnpm --filter @coffeeeeffoc/tianxia-server start
# http://127.0.0.1:43004/play/
```

首次从服务的 `/play/` 打开会自动选择该服务。独立 H5 可在设置中填写服务地址并开启服务端对局。服务器重启会结束内存中的活跃对局，已完成战报保存在私有数据目录。客户端访客凭证只存于当前页面内存，刷新后不会恢复旧对局；征战解锁保存在本机，并不等于跨设备云存档。

Web Shell 目录已注册 `tianxia-chalu`，独立制品地址为 `/games/tianxia-chalu/index.html`。现阶段交付为浏览器 H5 / Shell iframe；未制作微信、抖音或 B 站原生 Canvas 包。

## 玩法与第一版边界

- 初识岔路 → 两岸争渡 → 四方逐鹿，分别引入两方、三方和四方争城。胜利后解锁下一关；四方试炼可直接体验 1 真人 + 3 AI，不写入征战进度。
- 每城同速产兵，保留 8 兵，按固定节奏自动出发。部队先走到本城岔口，再按当时军令选择目的地；已经离开岔口的部队不会折返。
- 友军入城增援；敌军与守军一比一抵消。守军减至零时保留原归属，下一名敌军攻入后占领；新城和岔口归占领方，自动继续产兵。
- AI 有扩张、进攻、防守、捡漏四种权重。三档难度改变反应间隔与误判概率，不修改战斗和生产数值。地图上的 AI 均有明确标记。
- 一局最多 180 秒。其余阵营城池、在途兵力均清零时提前统一；时间结束先比较城池数量，再比较总兵力（含在途部队）。玩家与领先阵营两项均相同时为平局；玩家落后仍判负，即使领先对手相互持平。
- 不添加英雄、抽卡、数值养成或广告。第一版验证「改道 + 兵流 + 多方博弈」；后续真人匹配、好友房和平台登录扩展到服务端房间/席位层，不重写规则引擎。

地图与解锁配置在 `src/content/levels.mjs`，自带内容版本、配置校验和进度迁移。核心规则在 `src/core/index.mjs`，可序列化、确定性重放。`render.mjs` 只绘制沙盘；`main.mjs` 管理页面和生命周期；`storage.mjs` 在存储受限时降级为本次会话；`remote.mjs` 处理服务指令、快照及重试。

本地模式切后台自动暂停，不补算离开时长。服务端模式请求暂停；无法确认时明确提示服务端可能仍在推进，恢复时先读取真实状态。开发模式通过统一 `SmallGamesDev` 开启，可快速结算或试玩，调试操作不会解锁关卡或发放奖励。

## 验证

```sh
pnpm --filter @coffeeeeffoc/tianxia-chalu test
pnpm --filter @coffeeeeffoc/tianxia-chalu build
pnpm --filter @coffeeeeffoc/tianxia-chalu test:browser
pnpm --filter @coffeeeeffoc/tianxia-server test
pnpm --filter @coffeeeeffoc/tianxia-server smoke
```

浏览器测试使用 Chromium 模拟手机触控，覆盖主页、选关、改道、暂停、结算、存档及开发模式隔离；其结果不能代表微信或手机真机验收。视觉方向与实际截图见 [设计记录](docs/design/README.md)。
