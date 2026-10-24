# 固定战场与角色动作验收

2026-10-24，本地未提交版本。真实 Cocos Creator 3.8.8 web-mobile 生产构建，源码指纹 `94b0b911e9243eec1d368bcf262c239d5c3bcba73c5542238a79dc2c5f35a330`，preview 渠道。

## 完成内容

- 镜头不再读取玩家位置，而由关卡边界与视口确定固定中心和缩放。移动、冲刺、转身不带动地砖；横屏触控区域移至左右，为固定全景保留高度。`world` 与 `unworld` 继续使用同一投影。
- 原角色新增八方向、四步态透明图集。按实际移动距离推进步伐，反向移动反播；停止、撞墙不原地跑步；暂停沿用模拟时钟冻结。脚底阴影、轻微重心倾斜和前后遮挡补充空间感。
- 瞄准复用普通攻击的目标资格、天气射程；开火反馈读取实际普通射击角度，包含回声连射与反向技能组合。增加 `lastShot` 表现记录，并在重开时清空；不改变伤害、射速、判定或暂停逻辑。炮口短闪、回弹和离膛短尾迹只作用于展示层。
- 图集增加到资源加载、进度、失败重试和销毁流程。素材用内置 imagegen 生成，参考原 actors.png，提示词见 [prompts.txt](prompts.txt)；实际使用文件为 `assets/resources/art/hero-motion.png`。这是八方向 2.5D 动作表现，不是骨骼 3D 模型。

## 已执行验证

- `node scripts/typecheck.mjs`、真实 Creator 构建通过。
- `node --test --test-concurrency=1 tests/*.test.mjs`：171 项通过，包括固定全景四角安全范围、距离步态、停止/暂停、八方向、最短转向、射程外预瞄、天气与命中层、回声连射中反向施放技能，以及原有重开与存档规则。
- [motion-report.json](actual/motion-report.json)：330×717、320×568、844×390 真实触屏依次走到右、左、上、下边界，所有采样镜头数值不变，角色投影随位置变化；四帧步态、至少三个真实战斗朝向、炮口闪光/回弹、暂停冻结通过。浏览器记录是只读快照，没有注入战斗状态。
- [polish-report.json](actual/polish-report.json)：320×480、640×360、320×568、330×717、390×844、430×932、844×390 七尺寸菜单/触控布局通过。自然首关 26.58 战斗秒、第8次击杀得到首次强化，60.13 秒清场，100生命、20击杀；存档重载一致，零页面异常。
- `node tests/cocos.browser.mjs` 最终构建回归通过：[browser-report.json](actual/regression/browser-report.json)。包含多指移动/冲刺、技能拖动取消与实际施放、失败/重试、开发模式、同源 iframe、暂停/失焦/resize、存档，以及串行执行的移动回归与真实 WebAudio 生命周期。页面异常为零。

## 实际画面与资料

[右边界](actual/motion-330-right.png)、[左上角](actual/motion-330-top.png)、[横屏](actual/motion-844-bottom.png)、[移动中的战斗](actual/battle-moving-390.png)。所有截图来自当前生产构建；图集和设计材料不充当运行截图。

新版实际游戏录屏与宣传剪辑独立归档，见 [上架资料](../../../publishing/STATUS.md)。上一轮素材与验证记录保留。

未提交、推送、部署或上传平台。当前证据来自桌面 Chromium 的触屏模拟，尚未做手机真机、微信/TapTap 原生 SDK 或广告库存验收。未因展示层改造重复上一轮的完整关卡平衡模拟。
