# 城市无尽追逐验收

2026-10-22；基线 dev `cbee0202b8cd6ea3f5dd626851a10e6dd602dd75`，当前工作区 0.2.0。Node 24.21.0 / pnpm 12.6.0；Chromium 151.0.7922.173、Linux、软件 WebGL；Blender 4.3.2。

## 已执行

| 范围                                                       | 结果                                                                  | 证据                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 固定引擎完整性、网格与骨架、纯规则、存档、服务、Shell 入口 | 24 项 Node 测试通过（游戏 17 项、共享入口 7 项）                      | `node --test games/local/chase-thief/tests/*.test.mjs apps/shell-web/scripts/standalone-game-entry.test.mjs` |
| 核心规则 TypeScript 严格检查                               | 通过；仅纯 core 模块                                                  | TypeScript 7.0.2，ES2022 / NodeNext / strict / noEmit                                                        |
| 生产 Web 浏览器流程                                        | 通过，0 console/page 错误；20 公里流式街区数量有界                    | [browser-report.json](browser-report.json)                                                                   |
| 手机布局                                                   | 390×844、360×640、430×932；主要菜单按钮均在逻辑视口内                 | 当前目录截图                                                                                                 |
| 正常游玩闭环                                               | 原生触屏滑动、正常三撞失败、重试、纪录跨刷新、后台暂停、设置返回      | 同浏览器报告；正常成绩与开发试玩分开验证                                                                     |
| 桌面输入                                                   | 鼠标每次操作只执行一次                                                | 同浏览器报告；修复 Cocos 鼠标模拟触摸与重复处理                                                              |
| 大厅与分享兼容测试                                         | 202 项 Vitest 测试通过                                                | standalone、standalone-immersive、catalog-assessments、catalog-filters、game-sharing                         |
| Shell 生产产物与 iframe                                    | TypeScript、Vite Pages 构建、Chase 独立/嵌入/手机操作、沉浸返回通过   | [shell-pages-report.json](shell-pages-report.json)                                                           |
| 公共开发模式                                               | 42 款静态同步检查、5 项规则测试、Chase 及公共组件 10 项浏览器检查通过 | [dev-mode-report.json](dev-mode-report.json)                                                                 |
| 公共全屏与登记                                             | 26 份全屏副本一致；42 款游戏登记检查 0 问题                           | `sync-h5-fullscreen.mjs --check`、`check-game-config.mjs`                                                    |
| 实际录像                                                   | 普通模式，真实菜单触屏与键盘操作；无无敌、手动时钟或开发跳段          | [录制证据](../../../../publishing/gameplay/videos/recording.json)                                            |

[build-info.json](build-info.json) 保存最终运行代码、素材和固定引擎的哈希清单。最后打包补齐哈希清单，并将引擎模块引用改为相对路径以兼容静态宿主和依赖扫描；最终录像再次验证发行入口、相同玩法逻辑与素材，并记录对应 artifact SHA-256。Shell 回归执行在最后一轮纯美术高度校准前，后续变化未修改 Shell 接口、菜单或规则。

## 视觉核验

已打开核验首页、跑动、分岔、集市、暂停、结算，以及实际录像与宣传视频抽帧。与 [概念效果图](../concept.png) 相比，当前实现保留暖色老城、青绿 HUD、蓝/橙人物关系；游戏使用简化几何、立面纹理、雾与贴地阴影，细节量低于概念画，不能将效果图当作实机截图。

校准结果：弯曲道路与建筑在同一世界坐标；中央绿植降低到不遮挡通道的高度；镜头同步 400 米原点重定位；高箱堆和满载推车明显区别于可跳矮栏；小偷绕障采用连续换道；非共享街段/沟壑网格按生命周期释放。

## 尚未验证的范围

没有 Creator 编辑器可执行程序，已生成工程交接入口，但未执行 Editor 原生构建；引擎源码生成完整声明时也因缺少原生 external 声明失败，未声称完整 Cocos API 静态类型检查通过。当前构建通过 Node TypeScript 语法剥离与实际 Cocos 浏览器运行验证。

没有把 Chromium 触屏模拟当作 Android/iOS 真机、Safari 或微信/抖音小游戏验收。发布到这些目标前需在对应工具链执行构建与实机帧率、内存、前后台、音频、触控测试。当前无 60 fps 真机性能承诺，未部署或提交渠道审核。
