# Carding-car world integration implementation plan

**Goal:** 在现有 Cocos 赛车中接入七套世界、十款车、十位车手和十二类随机道路道具，并通过实际浏览器输入验收。

**Architecture:** 保留现有比赛、操控、镜头和 TrackBarriers 碰撞规则。世界定义提供路线与环境布置；道路由同一套中心线生成渲染和碰撞，源场景 GLB 只作环境地标。素材子仓库保留原件并导出轻量运行版本，游戏构建只复制运行资源。

**Tech Stack:** Cocos Creator 3.8.8、TypeScript、Node 原生测试、Python/Pillow GLB 导出、Playwright/system Chrome。

## 工作分配与顺序

1. **Agent A / 运行素材**：独占 `assets/carding-car/`，复核 39 个模型；新增 `build-expansion.py`、`runtime-expansion/` 的车辆、坐姿车手、道具、场景远景、八类可重用周边模型和贴图。保留原素材，统一尺度、朝向与落地点。使用哈希、GLB 解析和实际渲染检查导出。
2. **Agent B / 通用功能**：独占游戏 `assets/scripts/`（场景文件除外）和新增逻辑测试。增加世界定义、选择保存、赛道配置、车辆/车手显示、随机道具及效果、加载状态和诊断。保持原海湾模式与已有输入回归兼容。
3. **Root / 构建集成**：维护 `scripts/prepare-art.mjs`、`scripts/artifact.mjs`、导出完整性测试、依赖和构建环境。验证运行素材能进入构建、变更能使旧产物失效、总包预算仍满足限制。
4. **七个场景 Agent**：通用功能稳定后逐一启动独立 Agent，分别仅修改 `assets/scripts/scenes/{city,desert,glacier,sea-highway,danxia,highland,tibetan-grassland}.ts`。每个世界应有独立路线、配色与可识别景物，不以概念图代替可驾驶场景。限于四个并发名额，分批执行。
5. **最终检查 Agent**：所有场景完成后独立核对需求、代码、实际浏览器画面、资源错误、选择生效、道具交互和手机布局；将发现交回实施 Agent/root 修复，再复核。

## 稳定接口

- 子仓库输出：`runtime-expansion/{scenes,vehicles,drivers,items}/{id}.glb`、`textures/{sceneId}.jpg`、`props/{id}.glb`、`manifest.json`。
- 游戏加载：`resources/expansion/`，相对资源名 `expansion/vehicles/classic-kart` 等。
- 场景模块导出 `world: WorldDefinition`：路线控制点、道路宽度、可选近道、高度；地面、天空、道路配色；静态形体和独立模型布置。路线关闭成环，道路边界与碰撞共用数据。
- 车型必须处于现有车辆碰撞包络内；车手为坐姿显示，座位位置应与车型匹配。闭合座舱不能用站立人物穿过车顶。
- 随机道具要可复现测试，比赛内有接触反馈；暂停停止道具计时，重开清理效果与旧异步加载。

## 验证步骤

1. `python assets/carding-car/build-expansion.py`：所有运行模型自包含、哈希吻合、尺度/原点有效，记录包体积。
2. `node --test games/local/carding-car/tests/*.test.ts`：既有比赛、护栏、物理、圈数及新选择/道具/世界规则通过。
3. `node games/local/carding-car/scripts/typecheck.mjs`：真实 Creator 类型检查通过。
4. `node games/local/carding-car/scripts/build.mjs web-mobile`：生成当前源哈希的真实 Cocos 游戏。
5. `node games/local/carding-car/scripts/serve.mjs`：确认端口和页面身份，再用真实点击/触控选择、键盘与多指驾驶；七个新世界逐个截图。覆盖暂停/继续、重赛、选择保存、碰撞、加速/减速/打滑、三圈结算。
6. 在 960×540、844×390 和 390×844 检查画面、选择控件与可操作性；捕获脚本及资源错误。模拟结果不冒称真机验证。
7. 微信/B站构建检查已有 4 MiB 主包、20 MiB 总包预算；不放宽预算掩盖素材膨胀。
8. `pnpm check:games`；独立检查 Agent 给出问题清单并复查修复。更新 `playtest.md`，最后逐层提交素材子库、assets 引用和游戏代码；不推送远程。

## 完成记录

A/B、七个场景 Agent 和独立检查 Agent 均已完成。56 项测试、Creator 类型检查、全场景/车型/车手浏览器选择、手机横竖屏交互及完整三圈触控通过；三端构建符合原包体预算。独立检查发现的资源释放、失败重试和颜色丢失问题均修复并复验，长程回归暴露的 AI 脱困/检查点跨段问题亦已修复。详见 `games/local/carding-car/playtest.md` 的 2026-09-19 记录；实体手机与原生开发者工具仍待验收。
