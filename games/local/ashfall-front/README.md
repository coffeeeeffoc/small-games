# 灰烬防线 / ASHFALL FRONT

原创灰绿工业风横版射击游戏。三个连续战区、双波守卫、可连锁引爆的油桶、五种局内改装，以及两阶段 Boss「拆解者」。程序绘制场景、角色、粒子和合成音效，无外部运行素材或服务依赖。

## 运行

仓库根目录使用 Node 24.21.0、pnpm 12.6.0：

```sh
pnpm --filter @coffeeeeffoc/ashfall-front dev
pnpm --filter @coffeeeeffoc/ashfall-front build
pnpm --filter @coffeeeeffoc/ashfall-front test
pnpm --filter @coffeeeeffoc/ashfall-front test:browser
pnpm --filter @coffeeeeffoc/ashfall-front package:taptap # Windows PowerShell/.NET
```

开发入口为 `http://localhost:4467`；构建产物在 `dist/`。浏览器检查可通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定 Chromium。

手机使用左右、跳跃、冲刺和射击按钮，支持同时触摸。按住橙色射击键自动瞄准连射，手指从按下位置朝目标方向拖动：向右上/右下拖就向右上/右下射，左上/左下同理，松开或取消即停止。桌面 A/D 或方向键移动，空格/W/↑ 跳跃，Shift 冲刺；按住 I 斜上连射、J 自动瞄准连射、K 斜下连射，每个键单独开火，无需组合键。斜向跟随面朝方向，逗号键仍可斜下射击。按住鼠标左键自由瞄准，Esc 暂停。主页和暂停页均可打开操作指南，按当前触屏/键鼠操作显示对应说明；从暂停查看指南后返回暂停，再继续战斗。主页、选关、改装、暂停与结算自动聚焦主操作，回车触发当前按钮，Tab 切换按钮。主页和暂停页提供全屏，竖屏手机自动旋转完整游戏容器，系统自动旋转关闭也可操作。

TapTap 采用 H5 游戏上架方式：官方上传工具接收 `dist/` 目录，手工上传使用 `package:taptap` 生成的 ZIP，入口为唯一顶层目录下的 `dist/index.html`，后台横屏参数为 `screenOrientation: 2`。包体、操作与提交流程见 [TapTap H5 上架说明](docs/deployment/taptap-h5.md)；后台上传、审核和手机 TapTap WebView 验收尚未执行。

正常通关解锁后续战区，刷新保留进度。每次行动重新选择改装；仅从首关完成全部战区计入最佳时间。`?dev=1` 使用仓库公共开发面板，跳关、补血均标记试玩，不写入正常奖励。只读快照不改变游戏状态。

## 结构与验证

- `src/core.mjs`：与 DOM 无关的固定步长规则、伤害、碰撞、升级和结算。
- `src/levels.mjs`：稳定关卡 ID、地形、波次、奖励、解锁与内容校验。
- `src/render.mjs`：多层场景、动作、预警和受击效果，不修改模拟状态。
- `src/main.mjs`：页面流程、输入、公共开发模式和生命周期。
- `src/host.mjs`、`progress.mjs`：Game Host 兼容存储端口、存档校验及内存降级。
- `src/display.mjs`：横竖屏变换与触控坐标映射。
- `tests/`：规则、存档与生产构建真实多点触控流程。

产品方案、实施前效果图见 [docs/design](docs/design/design.md)。实际浏览器截图与结果见 [docs/qa](docs/qa/verification.md)。本次交付 H5 独立入口及 Shell iframe；桌面 Chromium 的手机模拟不代表物理设备或原生小游戏平台验收。
