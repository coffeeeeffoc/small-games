# 五平台原生接入真实状态（2026-10-06）

固定范围：Shell 前9里的 `travel-bund`（外滩漫游）。本轮新增真正原生入口 `native/index.tsx`，没有改原H5界面/玩法。原Scene、Rapier控制器、全城398个GLB、交通/游客/生活对象、路线与四关照片寻景沿用原资源/规则；页面和HUD由宿主Canvas2D纹理叠加到同一个Three WebGL2场景，无DOM、iframe或WebView。设计图先于实现保存于 `native-design-2026-10-06/concept.png`。

| 平台 | 游戏入口 | 平台资源接入 | 真实宿主验收 |
|---|---|---|---|
| 微信 | 共用真实原生入口已实现 | wx文件/远程请求与WXWebAssembly资源桥 | 官方工具/真机未运行 |
| B站 | 共用真实原生入口已实现 | bl文件/远程请求与实际标准WebAssembly探测 | 官方工具/真机未运行 |
| 抖音 | 共用真实原生入口已实现 | tt文件/远程请求与TTWebAssembly资源桥 | 官方工具/真机未运行 |
| 快手 | 共用真实原生入口已实现 | ks文件/远程请求与实际标准WebAssembly探测 | 官方工具/真机未运行 |
| 支付宝 | 共用真实原生入口已实现 | 独立my请求/storage/Canvas规范化；实际标准WebAssembly探测 | 官方工具/真机未运行 |

平台桥由 `platforms/<platform>/native-resources.mjs` 提供，不能用此表推断B站/快手/支付宝必定提供WebGL2或WASM。真正缺能力报 `TRAVEL_UNAVAILABLE`，不启动替代玩法。SDK必须具备真实WebGL2、Canvas2D、图像解码、文件/远程二进制、WASM实例、存档、触摸/后台监听与帧调度。环境参数与五份实际构建/包体状态由整合负责人记录，本表不把构建等同平台验收。

入口为异步 `startNativeTravelBundGame(sdk, {platform,preview,assetRoot,assetBase,shareEnabled})`，返回 `{canvas,whenReady,ready,snapshot,dispose}`；根入口必须等待 `whenReady` 后报告启动成功。保留原五组存档键、三条路线、四关寻景站位/朝向与实际已加载地标判定、真实WebGL readPixels拍照；未配置分享/相册导出明确不可用或只保留当前手记，不假奖励或登录。原WebAudio环境声替换真实wav+InnerAudioContext，不声称原浏览器空间声场。

构建命令与接口见 `../../native/README.md`。原包内全资源约38MB，预解码无损原型122,097,117bytes，不能作为合法主包。最终主包保留原Rapier WASM、纯JS官方Draco decoder、寻景参考图和声音；world.json与原压缩GLB从显式HTTPS assetBase惰性读取。原子模块固定SHA `66a0b5c190957f73645fcca92446db964c5557ff`，每份远程资源按包内manifest校验SHA256，托管漂移明确失败。

Preview使用已有Pages资源 `https://coffeeeeffoc.github.io/small-games/games/travel-bund/`；release必须提供 `MINIGAME_TRAVEL_BUND_ASSET_BASE`，用户注册后在平台登记合法域名。公开AppID与服务端secret由根配置层区分，客户端不含secret。主包基础测量与远程38,142,217bytes见 `native-design-2026-10-06/package-size-report.json`；平台wrapper/config后的最终预算需要根构建检查。

新增真实场景浏览器专项使用Chromium WebGL2、原GLB、真实Rapier WASM、实际文件IO，覆盖两方向原生页面/移动/触点取消/环顾/拍照手记/后台暂停恢复/释放监听；no-DOM专项运行DedicatedWorker、真实OffscreenCanvas、真实WASM与原场景，主动移除TextDecoder后以真实UTF-8算法支持原JSON/GLB/Rapier解码。测试报告见 `native-design-2026-10-06/validation/`，纯输入/存档/SHA契约见 `contracts-report.json`。软件WebGL截图和浏览器SDK契约都不能证明实体手机帧率、宿主图像解码/GL2支持、平台下载/合法域名/审核通过。声音/相册/分享的实际宿主调用、上下文丢失恢复、五平台工具与真机均待外部验证。

## 第一阶段H5只读审查与验证

源码边界证据（行号以本轮 checkout 为准）：`main.tsx:11/1919` 的 React DOM mount；`:490` 浏览器fetch world.json；`:859/907` DOM Canvas拍照与blob URL导出；`Scene.tsx:118/235/570` GLTF/Draco资源加载；`:343/634` Rapier物理；`:907` R3F Canvas；`audio.ts:13` Web Audio。已有数据/规则模块可以复用，以上浏览器宿主依赖不能通过更名API消除。

既有记录（本轮只读核验，不宣称重新执行）：mobile-report覆盖320×480/320×568/390×844/844×390、方向锁定/全屏拒绝、同源与跨域嵌入、持指旋转取消；controls-report覆盖双指/三指、摇杆+镜头、缩放、lost capture、暂停恢复；scene-visual-report为完整生产3D场景，两方向均有Canvas与相机比例证据。报告明确physicalMobile=false，不能当作物理手机验证。

依赖由整合负责人冻结安装后，本轮使用Node24.21.0完成全部 `node --test tests/*.test.ts`，47项通过（含真实Rapier碰撞、拍照站位、GLB资产、材质/几何预算和旧存档）。早期缺依赖导致的加载阻塞已解除，不再计为剩余阻塞。

本轮重新执行 `node tests/mobile-browser.mjs` 和 `node tests/controls.mjs`，均通过。Chromium151.0.7922.173，四种手机视口320×480、320×568、390×844、844×390；移动专项11组结果，包含主页/入口全屏/触控区域/暂停设置/退出全屏/持指旋转取消/地图/收藏/手记/回首页、全屏拒绝与不支持、同源及跨域嵌入、卸载清理、已开弹层全屏切换和桌面分支，errors=[]。多指专项在390×844和844×390各完成11项操作，errors=[]。

本轮报告保存于 `validation-2026-10-06/mobile-report.json`、`validation-2026-10-06/controls-report.json`。脚本使用真实App、DOM和触控，但隔离3D渲染器以稳定检验交互；此H5阶段未重跑完整生产3D场景；后续原生阶段的真实Scene验证单独记录于上述native-design目录，没有物理手机、Safari或五平台官方开发者工具验收。本轮没有改H5界面或规则，原生页面已独立先设计再实现。
