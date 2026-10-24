# 手机鼠标旋转与机关挑战

> 此方案已由[实体金属主线](../physical-metal/README.md)替代默认入口。旧关卡保留为兼容目录；本页报告只对应当时源码和旧媒体，上架目录已更新为当前版本。

2026-10-24。用户确认先扩展多环机关和路线难度。沿用现有 Cocos 3.8.8 金属环与星仪风格。

## 方案

保留 24 关主线及 74 关经典内容与 ID，新增独立 expert-01～06 机关挑战，首页直接可见、独立顺序解锁。9～12 环，双目标星核、钥环接力、宽口闭环与可保留支路组合；复用现有几何、锁与 BFS，避免重复玩法实现。较少环只是入门，不抬高教程门槛。异形环与齿轮留给后续明确需求。

双目标需要全部释放后结算，HUD 显示实际完成数。复杂图限制在四列左右，环不因增加数量缩成难点的细线。金属外观、松手释放、六度吸附、提示及广告辅助保持同一规则。

## 实施计划（writing-plans）

1. 在 tests/cocos.browser.mjs 加入手机触摸能力开启时真实鼠标拖动的回归，先观察环角度是否改变及松手是否释放；保留原生 CDP touch 验证。
2. 修改 assets/scripts/OrbitAtelier.ts 的浏览器输入接线，统一坐标及手势所有权，覆盖取消、失焦、多指、拖出边界与退出清理。原生 Cocos 输入继续使用已有逻辑。
3. assets/scripts/core/catalog.ts 增加六张独立布局及 expert campaign；rules.ts 接受该分类，storage.ts 按同一目录恢复和解锁。保持原关卡配置、revision 和存档键。
4. 更新 OrbitAtelier.ts 首页/选关/HUD/结果的分类与多目标计数；复用 AtelierView.ts 渲染，不添加依赖。效果草图见 concept.svg（非实机）。
5. 扩展 tests/nova-core.test.ts 覆盖可解性、真实分支、双目标、独立解锁、旧进度及新局恢复；浏览器以真实输入走通六关、取消/恢复及手机横竖屏。
6. 真实 Creator 构建、typecheck、游戏单测及浏览器回归；录制新关卡、更新 publishing/STATUS.md 和媒体摘要。构建身份与实际截图另记，不把概念图当验证。

## 验收

### 已复现的问题与修正

- 真实鼠标拖动遇到 pointercancel 后，旧接线保留拖动后的角度；统一指针接线恢复手势前状态，并处理丢失捕获、多指、拖出画布、失焦及销毁。
- 768×1024 的 SHOW_ALL 存在左右留边；使用实际引擎 viewport 统一输入和无障碍控件的坐标。preventDefault 后显式聚焦 Canvas，保留 Esc 和方向键。
- Android UA 依次切换 390×844 → 320×640 → 768×1024 → 844×390 时，旧构建保留 1024px 的 GameDiv 高度，实际视口只有 390px，导致画面拉长及点击错位。Creator 3.8.8 的键盘高度推算读取旧 scrollHeight；Web 改为自动方向，HTML/body 与 GameDiv 固定在当前视口，游戏自己的横竖屏布局生效。
- 复现脚本在最终构建下四种尺寸均可进入设置并返回；768×1024、DPR 3 的八项输入检查通过。原用户标签页未取得完整事件记录，不将本次桌面模拟称为该标签页或物理手机验收。

最终完整浏览器、源码身份及媒体结果见下方完成记录。物理手机、真实渠道广告、上传和部署不从桌面模拟推断。

### 完成记录

- 真实 Creator 3.8.8 Web Mobile 构建通过；源码摘要 `b6f274bf3c4ee4cf7ddf45eaf61a956cf6bfe0a381f3cccfaa53e7548b03848d`，dist 的 runtimeManifest 与源码指纹经浏览器入口校验。
- typecheck 通过，46 项单测通过；[完整浏览器报告](actual/verification.json) 15 项通过，覆盖 24 主线、6 机关挑战和经典末关的实际触摸通关、正常解锁、存档、取消、多指、暂停、键盘、iframe 和禁用存储。
- [分享专项](actual/publishing-verification.json) 4 项通过；[768×1024、DPR 3 采样](actual/high-dpi-verification.json) 8 项通过。独立只读复核未发现遗留实质回归。
- 实际画面对照：[十二环](actual/expert-12-portrait.png)、[小屏](actual/expert-12-small.png)、[横屏](actual/expert-12-landscape.png)、[平板](actual/expert-12-tablet.png)。沿用金属环风格与锁纹反馈；概念草图不作为实机证据。
- [上架资料](../../../publishing/STATUS.md)已更新；[旧实际录像](actual/previous-actual-play-390x844.webm) 36.04 秒，[旧宣传剪辑](actual/previous-gameplay-cut-390x844.mp4) 15 秒，尺寸和摘要已登记。
- 可复测命令：`pnpm --filter @coffeeeeffoc/orbit-atelier typecheck`、`test`、`build`、`test:browser`、`test:publishing:browser`。素材采集在游戏目录设置 `ORBIT_RECORD_VIDEO=1` 与 `ORBIT_EVIDENCE_DIR` 后运行 `node tests/cocos.browser.mjs --media`；高像素比可设置 `ORBIT_DEVICE_SCALE=3`。
- 构建启动曾因用户目录的零字节 Creator editor/window.json 停滞；确认文件为空后备份到忽略目录并恢复有效空对象，随后标准构建完成。未修改全局引擎源码或使用替代引擎。
- 本会话未提交／推送、未部署；手机真机、真实广告库存和平台审核未验收。保留工作区已有的其他维护改动。
