# 2026-10-22 Cocos 重构验证记录

状态：**真实 Creator 3.8.8 Web Mobile 构建、桌面触屏流程及分享专项通过。** 本记录随源码提交；最终合并候选的准确 base/head 和 CI/Pages 状态由独立发布检查记录，不把工作区测试代替发布证明。

## 构建与环境

- Windows 构建机：bolanggu，Creator 3.8.8、Node 24.21.0、TypeScript 7.0.2，使用安装目录导出的真实 `cc.d.ts`。
- 最终生产构建、类型检查、玩法浏览器和分享浏览器四项命令均退出0。Windows Chromium实际报告版本为155.0.8059.85，Playwright工具版本1.55.1。
- Linux复核：Node24.21.0、pnpm12.6.0、冻结工作区依赖，复用Windows真实制品和真实引擎声明。源摘要、35个运行文件摘要验证通过，类型检查和制品恢复构建通过。
- 构建源码SHA256：`e38e21bb13a0c17bcc1e47b3cedbc318585f80c8f00e1f7dd4f988144d458bcb`。
- 回传制品归档SHA256：`4f0db61de3be0becfb1509e956ac5f924e58ad3a539c60370ed1e4a40a735112`。
- 运行截图/报告归档SHA256：`457e691816d7867a0706a03cd99b023b60d495944b927bcf1f1206f685c4ac43`。

## 实际检查

| 检查 | 结果与范围 |
| --- | --- |
| 游戏测试 | 40/40：历史规则、证据工具、新规则/存档、Creator制品与场景引用 |
| 关卡可达性 | 24新关和74经典关按真实rotate/release规则求解；24关最短释放数与配置一致 |
| Creator/发布接入契约 | 135/135：publication-scopes、cocos-validation、reuse-cocos-artifacts、check-game-config、standalone-game-entry |
| 统一开发工具 | 扫描62款游戏，0不同步问题；fullscreen的26份副本匹配；工作区依赖边界通过 |
| 原生Canvas触屏 | [10项流程通过](actual/verification.json)：24关真实手势三星通关、经典第74关、存档、设置、开发试玩、iframe、存储不可用 |
| Shell生产入口 | Linux Chromium140：嵌入鼠标、390×844触屏、拖环、暂停恢复与返回目录通过 |
| 开发模式浏览器 | [10项通过](actual/dev-mode-verification.json)：独立/Shell的默认、URL、存储、显式关闭，以及共享控件手势与iframe传递 |
| 分享专项 | [4项通过](actual/publishing-verification.json)：提示/撤回代价、挑战进度隔离、公开URL清理、系统分享取消、无效挑战参数 |

输入通过Chromium CDP touch注入，测试用只读快照定位Cocos原生控件，没有调用接口直接改局面。逐次旋转和松手均断言实际释放，24关走正常解锁；经典第74关同时比较编译后几何与原始配置。取消完整恢复局面，慢拖能离开磁吸点，前一环飞离时可操作下一环。

## 实际画面

[主页](actual/mobile-home.png) · [游玩](actual/mobile-playing.png) · [对齐反馈](actual/mobile-aligned.png) · [星图](actual/mobile-levels.png) · [暂停](actual/mobile-paused.png) · [设置](actual/mobile-settings.png) · [帮助](actual/mobile-help.png) · [最终结算](actual/result-24.png) · [320小屏](actual/mobile-small.png) · [横屏](actual/mobile-landscape.png) · [iframe结算](actual/iframe-result.png)

截图来自最终Creator生产构建。核对了主要页面、文字、安全区、底部操作和素材完整性，未见阻断性遮挡或越界；底部渐暗改善背景上的文字对比。环体仍为实时矢量材质，雕纹和金属细节少于概念图，不宣称与概念图逐像素一致。

## 实际运行中修复的问题

1. Creator编译器对Map/Set迭代器展开生成错误数组，导致素材就绪状态与部分经典配置失真。相关展开改为`Array.from`后，重新使用真实Creator构建，并验证编译后经典第74关几何和触屏通关。
2. Creator默认模板样式覆盖隐藏元素，使全屏提示在底部留下空圆形。加入隐藏状态的明确样式，浏览器断言提示确实不可见。
3. 经典复杂关的测试完成器原先固定12次释放上限，改为当前剩余环数；保留每次真实输入和释放断言。

2026-10-21曾因Linux无Creator、Windows离线、依赖未完整安装而停止验证；当时没有生成替代引擎或虚假制品。设备恢复后完成上述真实流程，之前的环境失败不再代表本次最终状态。历史SVG截图与legacy测试仅作迁移参考。

## 验收边界

已验证的是Web Mobile产物在桌面Chromium的手机尺寸及触屏模拟，含横屏布局。尚未完成物理Android/iOS手机的听感、触感和系统前后台验收，也未单独验收Web Desktop构建或微信、抖音、B站原生小游戏包。分享测试使用可控系统API替身核对状态语义，不代表外部社交应用真实收件成功。
