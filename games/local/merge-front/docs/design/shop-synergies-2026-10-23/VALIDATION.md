# 商店与流派版本验证

2026-10-23；真实 Cocos Creator 3.8.8、Node24.21.0、pnpm12.6.0。运行源码指纹 `312ff45582619a9bc5a152aba7742a2d8904385ef77b0972dd283c293aad0076`，最终发布提交以所在Git提交及准确候选验证日志为准。

- `pnpm --filter @small-games/merge-front typecheck`：通过，使用真实Creator引擎声明。
- `pnpm --filter @small-games/merge-front test`：34项通过；包含商店交易原子性、12库存/6人口、配字保底、无限等级相加、出战/售出防循环、法术与流派、AI同规则、非法快照、暂停恢复、奖励回调和真实构建制品校验。30关×3种子90局全部6～12回合结束，50胜40负；这是固定AI对照，不是玩家通关率。
- `node games/local/merge-front/tests/balance-simulation.mjs`：8包×32成对种子共256局；逐回合校验快照、经济和终局，最终结果见 balance-report.json，调整前见 balance-before.json。各包胜率46.875%～65.625%，仍有实战平衡空间。
- `pnpm --filter @small-games/merge-front build`：真实Creator生产构建通过。首次导入新素材时生成meta触发源码变化保护，稳定meta后重新构建通过；未伪造制品或跳过摘要核对。
- `pnpm --filter @small-games/merge-front test:publishing:browser`：18组记录通过，无页面异常或失败资源；[完整报告](../../../publishing/gameplay/shop-browser-report.json)。CDP真实触摸覆盖三选一、购买/刷新/售出/配字/施法、拖放取消、原位隐藏、同名重叠合并、流派HUD命中优先、战斗锁阵、暂停/重开确认/切后台/刷新恢复、胜负重试、旧v2/v3对局键保留、四种视口及全屏进入/退出/拒绝。六种攻晶均验证暂停冻结、恢复后只扣一次血；减弱动态不改变模拟。
- 视口：1152×540、844×390、390×844、320×568、568×320；属Chromium手机模拟，无物理设备结论。
- 可选广告：实际通用提供器的SDK fixture覆盖完成/关闭/不可用/失败，只有完成加2金。未验收真实广告填充和渠道真机。

## 画面对照与媒体

[商店概念图](01-shop.png) → [实际商店](../../../publishing/gameplay/screenshots/shop-planning.png)；[开局/战斗概念图](02-starter-battle.png) → [实际战斗](../../../publishing/gameplay/screenshots/shop-battle.png) / [巨刃攻晶](../../../publishing/gameplay/screenshots/shop-crystal-sword.png)。角色、法器、投影与动作属于2.5D；战场保留上下空间和自由路径，手牌只显示实际拥有项。

八类资料见 [STATUS](../../../publishing/STATUS.md)。实际操作录屏26.04秒，宣传剪辑21.12秒，两者独立交付；均为无声H.264。媒体规格和SHA-256已逐项记录，解码帧实际打开核对。旧版正式媒体保留。

## 发布边界

本轮仅改 merge-front；并行dev变更正常合入。准确候选验证必须在提交后，以当时远端dev准确SHA为base，使用此源码匹配的真实Creator产物；推送非强制。CI/Pages及线上部署为独立结果，不由本地通过推断。当前原生发布门禁为0，未执行微信/抖音/B站打包与真机验收；未提供真人联网对战或真人胜率结论。
