# 神机合阵 · Cocos 移动版

Cocos Creator 3.8.8 / TypeScript，横屏触屏优先。核心循环是「求字 → 自动合卡 → 拖动布阵 → 锁阵自动战斗 → 攻晶结算 → 下一回合」。当前为本地人机对战，提供六章30关、8位神将、8种移动机关、图鉴、准备、首次教学、暂停、结算与断局续玩。

## 运行与验证

从仓库根目录执行，COCOS_CREATOR 可指定真实编辑器路径：

```powershell
pnpm --filter @small-games/merge-front typecheck
pnpm --filter @small-games/merge-front test
pnpm --filter @small-games/merge-front build
pnpm --filter @small-games/merge-front dev
# 另一终端，生产包在 http://localhost:4197
pnpm --filter @small-games/merge-front test:browser
```

构建输出 dist/。没有编辑器时只接受源码及运行文件摘要匹配的 MERGE_FRONT_PREBUILT_DIR，其中须有 dist/ 和真实 cc.d.ts。不存在替代引擎构建。支持独立、Shell iframe 和共享开发者模式；开发操作不写正常通关记录。原生构建命令为 build:wechat、build:douyin、build:bilibili；AppID 沿用仓库 WECHAT_APP_ID、DOUYIN_APP_ID、BILIBILI_APP_ID，B站还需官方构建扩展。--config-only 只生成配置，不代表平台验收。

## 操作与规则

- 出阵准备页最多选3种神将、2种武器，决定残字池；这不是上阵分类配额。
- 求将、铸器每次花30灵石获得3枚残字。哪、吒是两张不能单独上阵的残字卡，完整配方自动消耗并合成一张1级哪吒卡；其他配方同理。
- 拖完整卡到我方空地成为独立个体，拖到同名个体则等级相加；没有同等级或星级限制。武将和武器合计最多6个。满员时仍可合并升级。场上个体拖回手牌可下阵。
- 只显示实际拥有的卡牌/残字；重复完整卡按同名同级堆叠显示数量，每次拖出一张。点击仅查看提示，取消/无效拖放不消耗卡牌。手牌多于一页时出现翻页箭头。
- 整备不限时、无被动收入；开战后禁止购买和改阵，每个上阵个体只生成一名战斗单位。二维自由移动、就近攻击，不设固定路线。
- 每回合最多30秒。全灭对手则获胜，双方仍有单位或同时全灭为平局。胜方伤害为2+存活个体数，最多8；水晶初始20。结算展示2秒，然后双方获得90灵石并进入下一次整备。阵容保留，战斗生命重置。
- 水晶归零结束；第12回合结束仍未击破时比较水晶剩余值，相同为平局。AI使用相同抽取、资源、命令、上限和战斗规则，整备开始时完成决策，敌方阵容可见。
- 暂停和切后台冻结模拟，恢复需手动继续。重开需确认，回首页保留本局。正常关卡进度沿用v2；回合对局使用match:v3，旧match:v2保留为备份但不能直接续打旧规则。清除浏览器存储会失去本地记录。
- 20Hz规则核与界面分离；保存最近4096条命令及其起始序号，超长整备操作仍可恢复。常规对局完整历史保留在此范围内。

## 可选激励广告

入口在暂停后的设置页，仅已配置提供器且尚未领取时显示。完整观看增加30灵石（一次求字费用），每局一次；取消、不可用、失败、跨局迟到回调均不发奖。使用后标记辅助记录，不影响正常解锁。没有广告位时隐藏入口，正常闯关无需广告。原有持续收入增益已随回合经济撤换。

H5 接入统一打包入口：

```powershell
$env:H5_ADS_ENABLED='1'
$env:TAPTAP_MERGE_FRONT_AD_UNIT_ID='实际H5广告位ID'
node scripts/h5-taptap-build.mjs --game merge-front --with-ads --without-service
```

原生 ID 分开配置，然后重建相应平台：

```powershell
$env:MERGE_FRONT_WECHAT_AD_UNIT_ID='实际微信广告位ID'
pnpm --filter @small-games/merge-front build:wechat
# 抖音：MERGE_FRONT_DOUYIN_AD_UNIT_ID
# B站：MERGE_FRONT_BILIBILI_AD_UNIT_ID
```

Web 复用 platforms/h5/game-rewards.js；原生打包同一 platform-ads.js 提供器，通过 MergeFrontHost.ads 交付 offer/cancel/dispose，不复制 SDK 回调规则。宿主也可注入遵循 GameHost 广告契约的 MergeFrontHost.ads。真实广告填充、平台授权和物理设备需在配置真实 ID 后验收，SDK fixture 只验证逻辑契约。

## 代码与内容

| 路径 | 职责 |
| --- | --- |
| assets/scripts/core/content.ts | 配方、关卡配置与引用校验 |
| assets/scripts/core/engine.ts | 20Hz纯规则、种子随机、命令校验、AI、自由移动战斗与快照 |
| assets/scripts/core/progress.ts | 存档迁移、解锁、勋章与幂等结算 |
| assets/scripts/core/rewards.ts | 单局奖励及取消、迟到回调保护 |
| assets/scripts/MergeFront.ts | 页面、触屏、生命周期与端口接入 |
| assets/scripts/MergeView.ts | Cocos节点、图片、HUD与战斗表现 |
| assets/resources/ | 原创图集、场景与音效 |
| docs/design/ | 重构方案、效果图与验收记录 |

核心没有 DOM、Cocos 或 SDK 依赖。联机接入时由服务器运行同一规则核，客户端提交带 matchId/seq/version 的命令并插值展示快照；服务器管理种子、抽取、推进和胜负。当前尚未提供匹配、房间服务或真人对战，纯核回放测试不等同于跨设备联机验证。

## 本轮视觉与发布资料

[批准的效果图](docs/design/round-formation-2026-10-23/README.md) · [改造计划](docs/plans/2026-10-23-round-formation.md) · [实际验证记录](docs/design/round-formation-2026-10-23/VALIDATION.md) · [八类发布资料与当前状态](publishing/STATUS.md)
