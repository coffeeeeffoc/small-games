# 去野 · 大理漫游记

手机优先的沉浸式旅游 H5：从手绘地图走进六幕精细微缩插画，滑动控制镜头推进、文字视差与景观转场，收藏印章和插画明信片。原生 HTML、CSS、JavaScript 与浏览器滚动，无运行时依赖、无需构建。

## 运行

Node.js 18 或更新版本：

```sh
npm start
```

默认地址 http://localhost:4173，`PORT` 环境变量可修改端口；当前预览为 http://localhost:4178。手机可通过同一局域网访问电脑 IP 和对应端口。需通过 HTTP 服务运行，不使用 `file://`。

## 游览与收藏

- 地图选择目的地，点「就去这里」展开画卷。六章依次为古城、三塔、花甸、喜洲、咖啡、码头。
- 手机上下滑动，电脑滚动鼠标或使用方向键。往回滚动能完整倒放镜头变化；点击章节可直达任意地点。
- 浏览不扣资源。点「收藏这一刻」保存插画明信片并领取印章，消耗该地点的旅费、体力和 2 小时。
- 08:00 出发，18:00 日落；每天每站只能收藏一次。收集 4 枚达成目标，资源允许时可收集第 5 枚；所有六处风景始终可浏览。
- 入口「歇一会儿」消耗 ¥15 和 1 小时，恢复最多 30 体力。旅程结束后仍能重新进入画卷。
- 手账保存在本机浏览器，支持导出 PNG；重新出发保留历史收藏。旧版手账仍然兼容。

六幅画面是 AI 生成的原创大理灵感插画，采用统一暖色和精细微缩景观构图。镜头由滚动实时控制；这是图像分层动效，不是自由走动的实景 3D 重建。地图、时间、费用均为游戏设定。

## 验证

```sh
npm test
node checks/journey-check.mjs
```

状态检查验证扣费、重复收藏、时间边界、存档及完整旅程；画卷检查验证连续帧、反向滚动的确定性、减少动态效果与收藏状态。浏览器脚本通过真实滚轮、触控手势、导航和收藏按钮验证桌面与手机视口，输出截图及 JSON 报告到 `artifacts/`。

浏览器验证默认使用本机 Chrome 和相邻 `small-games` 中已安装的 Playwright；可用 `BASE_URL`、`PLAYWRIGHT_PATH`、`CHROME_PATH` 覆盖，详见脚本开头。模拟手机不等同于实体手机实测。

## 文件与静态部署

上传 `index.html`、`credits.html`、`style.css`、`journey.css`、`app.mjs`、`journey.mjs`、`game-state.mjs` 和 `assets/`，保持相对路径。`.mjs` 应返回 JavaScript MIME 类型。无需服务端账号或数据库，不依赖外部图片 CDN。

核心实现仅在 `journey.mjs`：原生滚动容器与 sticky 全屏舞台，按滚动位置计算场景和文字变换。ResizeObserver 在尺寸变化时保留章节位置，支持 `prefers-reduced-motion`，图片失败可重试或返回。

六张运行时插画、原始生成路径及完整提示词见 [创作记录](assets/journey/README.md)。入口地图、字体许可见 [地图说明](assets/art-direction.md) 和 [字体说明](assets/font-subset.md)。

`travel-3d.mjs`、`travel-world.mjs`、`travel-3d.css`、`vendor/`、`assets/reference/`、`assets/pbr/` 及旧 3D 检查保留为上一版资料，当前入口不加载它们；[素材来源页](credits.html) 保留原摄影署名与许可，支持旧手账追溯。
