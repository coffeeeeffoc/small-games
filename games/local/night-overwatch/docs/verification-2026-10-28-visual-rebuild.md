# 夜航守望 · 视觉重做验证（2026-10-28）

本轮按用户要求移除旧原型及沿用既有风格的约束，重新实现首页、任务卡、菜单、战斗 HUD、场景材质和两条结算界面。页面对应效果图与完整验收原则见 [interface.md](design/interface.md)。保留核心战斗、网络和存档规则；改动中的游戏状态修复只涉及旧的超时判负说明及满员待开战房间的显示文案。

## 准确构建

- Creator 3.8.8，目标 Web/mobile；源码指纹 `9c90c5006cefe2ed2027b8182712410606532cad22b6f73fabf57f14361548bd`。
- 真实 Windows Creator producer：`2dce2486079c5f0c04cb954bf8d0abfd8ac48042`；[构建与测试](https://github.com/coffeeeeffoc/small-games/actions/runs/40644086163) 成功，306 项测试全部通过。
- GitHub artifact `12797147472`，ZIP SHA256 `5db91bbf17d791a075b9eeb54a19d91f02de9cef26dc4c789457f4d730a57f45`；[provenance](../reports/2026-10-28-visual-rebuild/cocos-provenance.json)。本地按当前源码摘要与输出摘要校验后恢复，真实引擎声明类型检查通过，最终 dist 共 21,451,723 字节。
- 以下浏览器证据均由这份源码对应构建生成。后续资料更新不改变运行源码指纹；旧 `6c7dad` 界面交付保留在 [历史验证](verification-interface.md)，不冒充本轮验收。

## 实际画面和操作

Linux Chromium / SwiftShader 运行真实 Creator 画布；568×320、844×390 使用触屏输入，1280×720 使用鼠标键盘，另检验390×844竖屏承载横屏游戏。公共接口隔离；本地房间测试使用生产 HTTP 路由与内存存储。

| 检查 | 结果与证据 |
| --- | --- |
| 40张菜单/战斗页面 | [style-evidence.json](../reports/2026-10-28-visual-rebuild/style/style-evidence.json)：首页、设置、手册、大厅、私密房、昵称、排行、记录、任务、战斗、飞行控制及退出；实际 Sprite 尺寸对齐按钮皮肤，44px热区独立，拖出再移回取消、双指加第三指取消通过 |
| 昵称和输入 | [input/evidence.json](../reports/2026-10-28-visual-rebuild/input/evidence.json)：三尺寸真实输入、保存重载、键盘缩屏焦点、房间/密码字段、记录页控件隐藏及单人/对战战况面板通过 |
| 单人真实胜利 | [review-evidence.json](../reports/2026-10-28-visual-rebuild/review-evidence.json)：正常瞄准射击完成，4个击杀，友军损失0，用时44.85秒；三尺寸结算、真实数据和返回可用 |
| 本地机器人对战 | 同份证据：正常瞄准射击获得胜利，用时118.70秒；燃烧区真实生成，三尺寸结算无重叠，结算期间模拟时间冻结，返回大厅通过；没有虚构公开积分 |
| 昼夜与热像 | 同份证据：四尺寸白天、黄昏、夜间、热像均截图并检查；EffectAsset加载和shader运行状态均为ready；热像不再被光学模型颜色压暗，切回光学恢复原色；未以材质回退代替验收 |
| 有房间大厅 | [lobby-evidence.json](../reports/2026-10-28-visual-rebuild/lobby/lobby-evidence.json)：三尺寸真实HTTP列表、翻页、加入、离开和刷新通过；满员待开战与对战中状态区分 |

各份最终证据的 errors 均为空。早期d496版本的竖屏上下文误用桌面UA，停在既有横屏提示，修正Android Mobile UA后已单独复核；旧记录保存在[前次证据](../reports/2026-10-28-visual-rebuild/previous-d496/review-evidence.json)。最终源码的单人、人机与四尺寸检查均已完成；对战定位测试原先误用单人准星同步断言，已改为核对实际小地图定位，再通过鼠标瞄准射击。已完成的同源单人录像保留，重新执行人机与光照部分；[原始分段记录](../reports/2026-10-28-visual-rebuild/review-before-duel-navigation-fix.json)和最终证据中的 reusedCompletedSoloEvidence 可追溯，没有沿用旧源码截图冒充当前版本。

逐图检查还发现热像的白热颜色受到模型深色顶点色相乘压暗，[旧近景](../reports/2026-10-28-visual-rebuild/previous-d496/thermal-close.png)与[检查记录](../reports/2026-10-28-visual-rebuild/previous-d496/thermal-inspection.json)保留。最终版本仅在单位热像材质关闭光学顶点色，原热值、残骸冷却和命中闪白继续有效；切回光学恢复原模型颜色。实际浏览器检查四尺寸材质定义往返，并打开[热像近景](../reports/2026-10-28-visual-rebuild/thermal-detail-1280.png)确认主体亮度。

截图检查确认银钢标题、夜谷背景、三张不同白天任务插画、卡片渐变和选中描边、金色切角主按钮、装甲面板及结算数据区实际呈现；按钮白色素材边角经运行时Mask裁切，缩屏无正文/按钮遮挡。场景增加地表/道路/水面材质、针叶林和河岸细节，并抑制远山高频噪点。

首页、任务、大厅和结算逐页对照认可效果图实现，实际任务名、数据与AC-130题材由游戏状态决定。战场仍是可交互三维场景，视觉评审不等同于逐像素复刻概念插画。未将软件渲染录屏当作真机性能或原生渠道验证；本轮未部署后端，内存HTTP测试不代表生产数据库验收。未执行无关游戏全量候选检查；dev独立CI/Pages状态按最终推送SHA单独核对。

## 交付资料

[八类资料状态](../publishing/STATUS.md)及[文件摘要清单](../publishing/manifest.json)已更新。新增八张1280×720真实截图、20秒实机录屏与16秒宣传剪辑；均来自本轮同源构建，H.264/yuv420p，无字幕合成、音轨或加速。图标、两张宣传插画与三份文案经复核沿用原文件，清单明确标记。
