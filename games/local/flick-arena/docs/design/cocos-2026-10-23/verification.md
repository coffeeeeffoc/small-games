# Cocos Web 迁移验收

日期：2026-10-23。初始画面基线 `a1f0a810`，提交前同步远端 `731dfd11`。Node 24.21.0、pnpm 12.6.0、Linux Chromium，390×844 DPR2、320×568 和 844×390；手机触屏模拟，不是物理手机或原生小游戏验收。

- 真实 Cocos Engine 3.8.8 WebGL Scene、Sprite、Graphics、Mask；引擎来源和摘要由构建校验。原生 Canvas 兼容入口保留，未生成 Creator 编辑器原生工程。
- 原有规则 64 项通过，保留 120 关和旧存档。闯关、练习、同机双人、暂停、回放、分享及收到挑战后的实际触屏胜利均通过。
- 首页六个按钮与同环境原 Canvas 布局做像素比较，RGB 平均绝对误差为 0.0554/255。渐变、双边框、阴影及中文衬线字体保留；[迁移前](before-home.png) / [迁移后](after-home.png)。
- [引擎专项](cocos-browser.json)：120 个开发者关卡动作、实际点选最终关、存档隔离、无全屏按钮、广告未配置返回 unavailable。连续 60 帧收圈不新增纹理上传，缓存约 18.6 MB。
- [最终关与旧存档](review-browser.json)：正常模式最终关真实触屏 4 次出手获胜，结算、存档、回放不重复发奖；旋转取消拖拽，旋转后圆盘有效触摸直径至少 44 CSS px。章节、暂停和键盘入口通过。
- [闯关/同机](campaign-browser.json)、[分享/重赛](publishing-browser.json)、[Shell](shell-browser.json)、[开发者开关](dev-mode-browser.json) 均通过，无页面异常。开发者开关覆盖 8 项独立/聚合入口组合。
- 公共奖励、广告和插屏模块的 34 项测试通过。首次同时运行多个浏览器时，旧广告测试的短定时等待出现一次竞态；串行重跑完整 34 项通过，未修改公共广告实现或放宽断言。

横竖屏修复使用公开 `cc.view.setFrameSize`，同步引擎 backing buffer、相机与 GPU 视口。页面通过 CSS inset 自适应时仅依靠引擎 SubFrame 的 inline style 检测会漏掉 resize，已由 stage ResizeObserver 驱动同步。

[上架素材](../../../publishing/STATUS.md) 包含当前 Cocos Web 实际截图和连续真实触屏录像。在线协议未变；本轮没有实际 Runtime/PostgreSQL 服务，因此未声称通过真人在线联机、渠道广告或原生真机测试。

提交后另对最终提交运行仓库 `validate:candidate`，准确 base/head 和完整输出保存在任务 `.scratch/flick/candidate.log`。此文件描述功能验收，不能替代该命令的最终通过记录。
