# 五平台原生接入真实状态（2026-10-06）

固定范围：Shell 前9里的 `travel-bund`（外滩漫游）。当前 H5 界面已具备首页、漫游、地图、设置、拍照寻景、手记、路线与互动小摊，移动端横屏旋转、安全区、多指输入和暂停恢复有现成设计/验证记录，见 `../design/mobile-2026-10-06/README.md`、`../design/controls-2026-10-06/`。

| 平台 | 原生运行入口 | 真实能力 | 下一步 |
|---|---|---|---|
| 微信 | 未实现 | H5、规则/物理/路线配置可复用 | 迁移React DOM/R3F渲染、资源加载、宿主输入/音频/存档 |
| B站 | 未实现 | 同上，不假设bl与wx完全同接口 | 同上，加官方宿主契约验证 |
| 抖音 | 未实现 | 同上 | 同上，加tt宿主验证 |
| 快手 | 未实现 | 同上 | 同上，加ks宿主验证 |
| 支付宝 | 未实现 | 同上，不将小程序Canvas当作小游戏入口 | 先核实my小游戏WebGL工程和生命周期后迁移 |

`src/main.tsx` 挂载 React DOM；`src/Scene.tsx` 使用 React Three Fiber / drei / rapier；`src/PhotoHuntUI.tsx` 与 HUD 由 DOM 呈现。移植必须替换DOM页面/对话框、相机/触控事件、Three纹理及图像加载、Rapier WASM初始化、宿主WebGL Context与帧循环，并保留真实建筑/街景、物理、路线和收藏存档。不可用WebView包装H5、返回截图或另造小游戏代替完整漫游。

本次没有新设计或改变已验证H5 UI。平台构建器应将本游戏五个平台明确标注 `blocked-native-migration` 并fail-fast，不把H5 assets或空壳计作五份可运行产物。所需原生公开入口约定：`startNativeTravelBundGame(normalizedSdk, {platform,game,appId,preview})`，实例提供dispose；在真实迁移完成前该导出不存在。规则、玩法与平台SDK保持隔离。

本文件不表示已完成用户要求的五平台交付；注册AppID不会自行解决原生渲染依赖。官方开发者工具、实体手机和审核均未运行。

## 本轮审查与验证

源码边界证据（行号以本轮 checkout 为准）：`main.tsx:11/1919` 的 React DOM mount；`:490` 浏览器fetch world.json；`:859/907` DOM Canvas拍照与blob URL导出；`Scene.tsx:118/235/570` GLTF/Draco资源加载；`:343/634` Rapier物理；`:907` R3F Canvas；`audio.ts:13` Web Audio。已有数据/规则模块可以复用，以上浏览器宿主依赖不能通过更名API消除。

既有记录（本轮只读核验，不宣称重新执行）：mobile-report覆盖320×480/320×568/390×844/844×390、方向锁定/全屏拒绝、同源与跨域嵌入、持指旋转取消；controls-report覆盖双指/三指、摇杆+镜头、缩放、lost capture、暂停恢复；scene-visual-report为完整生产3D场景，两方向均有Canvas与相机比例证据。报告明确physicalMobile=false，不能当作物理手机验证。

依赖由整合负责人冻结安装后，本轮使用Node24.21.0完成全部 `node --test tests/*.test.ts`，47项通过（含真实Rapier碰撞、拍照站位、GLB资产、材质/几何预算和旧存档）。早期缺依赖导致的加载阻塞已解除，不再计为剩余阻塞。

本轮重新执行 `node tests/mobile-browser.mjs` 和 `node tests/controls.mjs`，均通过。Chromium151.0.7922.173，四种手机视口320×480、320×568、390×844、844×390；移动专项11组结果，包含主页/入口全屏/触控区域/暂停设置/退出全屏/持指旋转取消/地图/收藏/手记/回首页、全屏拒绝与不支持、同源及跨域嵌入、卸载清理、已开弹层全屏切换和桌面分支，errors=[]。多指专项在390×844和844×390各完成11项操作，errors=[]。

本轮报告保存于 `validation-2026-10-06/mobile-report.json`、`validation-2026-10-06/controls-report.json`。脚本使用真实App、DOM和触控，但隔离3D渲染器以稳定检验交互；本轮未重跑完整生产3D场景，没有物理手机、Safari、软件WebGL性能推断或五平台官方开发者工具验收。已存在的完整场景证据沿用原记录，只读核验。本轮没有改H5界面或规则，因此不重新制作UI效果图。
