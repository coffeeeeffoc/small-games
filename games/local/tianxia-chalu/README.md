# 夺城令

竖屏优先的架空古代兵流策略游戏。Cocos Creator 3.8.8 绘制沙盘、城池、部队、将领与武器，并处理触屏；页面菜单复用 Web 的可访问控件。100 张独立地图按 10 章推进，保留旧三关进度。

本游戏现名《夺城令》，曾用名“天下岔路”，更早称“天下插旗”。技术标识与旧进度保持兼容，详见[更名与历史资料说明](docs/name-change-2026-10-22.md)。当前名称对应的文案、截图和录屏统一见[上架资料状态](publishing/STATUS.md)。

完整规则与 13 项需求追踪见[更名前的设计文档](docs/design/cocos-2026-10-22/design.md)，效果图和生成记录见[历史视觉记录](docs/design/cocos-2026-10-22/prompts.md)。该目录保留当时的名称、截图与验证结果，概念图不作为运行证据。

当前持续派兵、地图缩放与军衔匹配见[改版设计](docs/design/continuous-orders/design.md)。

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
- 点己城再点邻城，或直接拖向邻城，添加持续派兵路线；一城可同时指向多个邻城。点箭头中间浅色 X 只撤销该路线，快速双击己城停止该城全部新派兵；已出发部队继续原目的地。键盘保留辅助军令控件。
- 兵力越多，每波规模越大、间隔越短，连续派兵进一步加速；多个目标共享城池兵力并轮转分配。战斗仍按真实士兵、将领、兵器属性结算，不因波次数量相同抵消整队。
- 双指或滚轮缩放，拖空白平移；“地图／城池”切换战略总览与局部细节，加减按钮也可调整。小兵密度与数字共同显示战力。返回或 Escape 打开投降二次确认，确认期间战斗继续，没有暂停按钮。
- 普通城、兵营城、关隘、点将台，快/慢道路、三种守城兵器和六类将领逐章引入。相向敌军在道路上交战；容量外援兵驻城外，可被攻击且计入兵力。
- 各方都有基础局部增益；卡与将领光环只影响范围内友军，同类取最高并设总上限。“军情”列出本场来源，点击显示范围。将领持续占有点将台后产生，受围暂停招募。
- 普通对局180秒，进阶240秒；淘汰需要城池、军队和将领全部消失。结算按存活、城池、总兵力及淘汰顺序排名，并列共享名次。
- 自然结束免费获得一张按名次概率抽取的卡。可用真实激励广告完成后同用途升一级，每局至多一次；无广告能力时隐藏入口。取消、失败或不可用保留原卡。
- 日卡与一次性卡各一个装备位。准备不消耗，正式开战重新核验期限并消耗一次性卡；本局开始后冻结效果。重试保留地图 seed，不返还已消耗卡。
- 前四关动作教学、第五关练习；城池、将领和兵器图鉴记录发现/掌握。旧进度迁移保留，存储受限时仍可本地游玩。
- 45 级军衔与分模式战绩：人机获少量经验，真人匹配胜利经验更多，正常失败也有经验；投降不给经验，试玩不计入成长。真人匹配根据服务端等级和胜率选择真实排队对手，没有对手时保持等待。

## 模块与服务

纯规则在 src/core/，100 个显式配置在 src/content/maps/，目录和解锁来自同一 catalog。通过包的 ./engine、./levels 导出供独立 Node 对局服务复用。Cocos 场景在 assets/；main.mjs 管理页面和生命周期；storage.mjs / rewards.mjs 管理进度、库存和奖励；remote.mjs 保留凭证、序列与不确定指令重试。

[对局服务](../../../services/tianxia-server/README.md)负责权威模拟、真人队列、匿名玩家军衔及战报。客户端在服务设置中连接后可匹配，服务自带 `/play/` 入口也可使用。联机后台及网络中断时服务继续推进，恢复先查询结果；双人对局禁止暂停。身份按服务地址保存，本机练兵经验不作为在线排位数据。卡库为本地 PVE 库存，真人对局不携带卡牌优势。服务部署与真机渠道接入仍需独立验证。

统一 SmallGamesDev 支持 URL/localStorage 开关；开发试玩与快速结算不产生正式进度或奖励。使用普通浏览器视口，旋转与窗口缩放保持对局与触控映射。

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

生产浏览器测试串行运行，使用真实画布触屏操作和只读快照；测试注入的广告 provider、库存夹具均在报告中标明。当前运行报告输出到 `reports/browser/` 和 `reports/server-browser-report.json`，不覆盖历史验证资料。自动地图模拟只发送公开军令，不修改战局设胜。桌面 Chromium 手机模拟不能替代真机或渠道广告 SDK 验收。
