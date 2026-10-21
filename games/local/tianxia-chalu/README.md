# 天下岔路 · 百战山河

竖屏优先的架空古代兵流策略游戏。Cocos Creator 3.8.8 绘制沙盘、城池、部队、将领与武器，并处理触屏；页面菜单复用 Web 的可访问控件。100 张独立地图按 10 章推进，保留旧三关进度。

完整规则与 13 项需求追踪见 [设计文档](docs/design/cocos-2026-10-22/design.md)，效果图和生成记录见 [视觉记录](docs/design/cocos-2026-10-22/prompts.md)。实际截图和验证结果在同目录，概念图不作为运行证据。

## 运行与构建

仓库使用 Node.js 24.21.0、pnpm 12.6.0，实际构建需要 Cocos Creator 3.8.8：

```sh
pnpm --filter @coffeeeeffoc/tianxia-chalu build
pnpm --filter @coffeeeeffoc/tianxia-chalu dev
# http://127.0.0.1:5198/
pnpm --filter @coffeeeeffoc/tianxia-server start
# http://127.0.0.1:43004/play/
```

可设置 COCOS_CREATOR 指向本地编辑器。CI 使用 TIANXIA_PREBUILT_DIR 指向包含 dist/ 和真实 cc.d.ts 的制品；构建验证 Creator 版本、目标和源码散列，不使用 Canvas 替代构建。当前验收目标是 web-mobile：独立 H5 与 Shell iframe。原生微信、抖音、B 站包未包含在本次交付内。

## 操作与规则

- 每次新出征从合法出生组合随机布阵。默认驻军、留守均为 0，军令为屯兵；援兵卡为明确展示的例外。
- 点己城后点相邻城、从己城拖到邻城、点击箭头或“换方向”下令；“屯兵”停止新派兵。所有道路双向，已出发部队保留目的地；点空地取消选中。键盘可使用可访问军令按钮，Escape 暂停。
- 普通城、兵营城、关隘、点将台，快/慢道路、三种守城兵器和六类将领逐章引入。相向敌军在道路上交战；容量外援兵驻城外，可被攻击且计入兵力。
- 各方都有基础局部增益；卡与将领光环只影响范围内友军，同类取最高并设总上限。“军情”列出本场来源，点击显示范围。将领持续占有点将台后产生，受围暂停招募。
- 普通对局180秒，进阶240秒；淘汰需要城池、军队和将领全部消失。结算按存活、城池、总兵力及淘汰顺序排名，并列共享名次。
- 自然结束免费获得一张按名次概率抽取的卡。可用真实激励广告完成后同用途升一级，每局至多一次；无广告能力时隐藏入口。取消、失败或不可用保留原卡。
- 日卡与一次性卡各一个装备位。准备不消耗，正式开战重新核验期限并消耗一次性卡；本局开始后冻结效果。重试保留地图 seed，不返还已消耗卡。
- 前四关动作教学、第五关练习；城池、将领和兵器图鉴记录发现/掌握。旧进度迁移保留，存储受限时仍可本地游玩。

## 模块与服务

纯规则在 src/core/，100 个显式配置在 src/content/maps/，目录和解锁来自同一 catalog。通过包的 ./engine、./levels 导出供独立 Node 对局服务复用。Cocos 场景在 assets/；main.mjs 管理页面和生命周期；storage.mjs / rewards.mjs 管理进度、库存和奖励；remote.mjs 保留凭证、序列与不确定指令重试。

[对局服务](../../../services/tianxia-server/README.md)负责权威模拟及战报。服务模式前后台切换要求暂停确认，重连先查询是否已结算；网络不可用不假称已暂停。服务重启会结束活跃内存对局，凭证不跨刷新保存。卡库为本地 PVE 库存，服务校验有界玩法参数，不代表已验证跨设备卡牌所有权。

统一 SmallGamesDev 支持 URL/localStorage 开关；开发试玩与快速结算不产生正式进度或奖励。Web 全屏可拒绝并继续普通窗口游玩；旋转与窗口缩放保持对局与触控映射。

## 验证命令

```sh
pnpm --filter @coffeeeeffoc/tianxia-chalu typecheck
pnpm --filter @coffeeeeffoc/tianxia-chalu test
pnpm --filter @coffeeeeffoc/tianxia-chalu test:browser
pnpm --filter @coffeeeeffoc/tianxia-server test
pnpm --filter @coffeeeeffoc/tianxia-server test:browser
node games/local/tianxia-chalu/scripts/generate-campaign.mjs --check
node games/local/tianxia-chalu/scripts/generate-campaign.mjs --simulate
```

生产浏览器测试串行运行，使用真实画布触屏操作和只读快照；测试注入的广告 provider、库存夹具均在报告中标明。自动地图模拟只发送公开军令，不修改战局设胜。桌面 Chromium 手机模拟不能替代真机或渠道广告 SDK 验收。
