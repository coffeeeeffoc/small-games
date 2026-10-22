# 神机合阵发布资料

- Game ID：merge-front；更新时间：2026-10-23。
- 对应版本：回合布阵改版，Creator源码指纹 `6dc2443b95b1f8412b5b950e06c5e5b8c03731bed226132468155462b8ba865d`；提交身份随本目录所在提交固定。
- 目标：横屏手机 Web / H5 基础素材。当前阶段：素材整理与 dev 发布准备；未向渠道提交审核。
- 闭环：已成立。求字自动合卡 → 实际触屏拖动布阵/合并 → 开战锁阵 → 回合攻晶 → 再次整备；胜负/续关、暂停及刷新恢复通过。见 [浏览器记录](gameplay/browser-report.json) 和 [验证说明](../docs/design/round-formation-2026-10-23/VALIDATION.md)。
- 下一步：核对 dev CI/Pages，正式提审前按指定渠道尺寸及真机要求验收。

| 类别 | 状态 | 文件与规格 | 最近验证 |
| --- | --- | --- | --- |
| 游戏简介 | 已提供 | [简介](copy/introduction.md)，UTF-8 | 2026-10-23，核对当前实现 |
| 一句话推荐语 | 已提供 | [推荐语](copy/tagline.md)，UTF-8 | 同上 |
| 开发者的话 | 已提供 | [开发说明](copy/developer-note.md)，UTF-8 | 同上 |
| 图标 | 已提供 | [哪吒图标](icon/nezha-1254-square.png)，1254×1254 PNG，不透明 | 2026-10-23，实际打开检查 |
| 宣传图 | 已提供 | [主视觉](promo/images/round-formation-landscape.png)，1672×941 PNG，插画而非游戏截图 | 2026-10-23，实际打开检查 |
| 宣传视频 | 已提供 | [短片](promo/videos/round-formation-1280x720.mp4)，1280×720 H.264，无声，21.00秒；主视觉片头+实际操作片段 | 2026-10-23，ffprobe规格与解码帧检查 |
| 游戏内截图 | 已提供 | [整备](gameplay/screenshots/planning-1152x540.png)、[战斗](gameplay/screenshots/battle-1152x540.png)、[暂停](gameplay/screenshots/pause-1152x540.png)，1152×540 PNG；另有首页、次回合与结算 | 2026-10-23，真实Creator Web运行与人工查看 |
| 游戏内视频 | 已提供 | [实际录屏](gameplay/videos/round-formation-1152x540.mp4)，1152×540 H.264，无声，24.80秒 | 2026-10-23，Chromium触屏操作录制，ffprobe与解码帧检查 |

素材 SHA-256、字节数和逐文件尺寸见 [清单](media-manifest.json)。图标、宣传插画及本轮新增场景/水晶通过内置 image_gen 生成；角色运行图集沿用项目已有素材。宣传图按当前玩法作艺术表现，不作为实际截图。

录屏来自真实 Creator 生产包和触摸输入；初始种子固定为1，按生产规则创建正常开局，未注入高级单位或虚构战斗。测试中包含无效落点/取消手势验证，因此原始录屏保留短暂提示。结算截图来自合法规则运行至结算前一刻的存档恢复。手机浏览器模拟不等同于物理设备、微信/抖音/B站真机或真实广告填充。基础素材没有待制作项；渠道审核和真机验收尚未执行。

历史概念图保留在 docs/design/round-formation-2026-10-23，与这里的实际画面分开。
