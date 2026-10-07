# 星扣工坊 · Orbit Atelier

原创竖屏旋转解环益智游戏：按住圆环的实心部分沿圆周拖动，让缺口覆盖与其他圆环的两处交点，松手解开。先拆外围，再解分岔；没有连接的圆环可以点按收起。

三章共 24 张独立设计的星盘：**初光**学习旋转与拆解顺序，**星栓**引入按解环数量自动开启的锁栓，**星图**组合不同半径、缺口与分岔。每关均由求解器验证可达；关卡数据和配置校验与 DOM、渲染、渠道代码分离。

## 运行

```sh
pnpm --filter @coffeeeeffoc/orbit-atelier dev
pnpm --filter @coffeeeeffoc/orbit-atelier test
pnpm --filter @coffeeeeffoc/orbit-atelier build
pnpm --filter @coffeeeeffoc/orbit-atelier test:browser
```

开发服务端口为 4340。大厅访问 ID 为 `orbit-atelier`，独立静态入口为 `/games/orbit-atelier/index.html`；可在同源 Shell iframe 中沉浸游玩。

## 操作与进度

- 触屏或鼠标直接拖动圆环；重叠时选择最接近触点的实心圆周。松手判断是否解开，取消手势恢复本次拖动前的状态。
- 撤回恢复上一次转动和解环；提示仅标出可解环及目标方向，不自动操作。首次教学在场景底部出现，完整规则位于设置内的解扣指南。
- 解锁关卡按目录顺序推进。独立完成且转动次数不超过圆环数两倍得三颗星，其他独立完成得两颗星，使用提示得一颗星；重玩仅保留最高星数。
- 当前星盘、转动、提示、星级和声音／震动／减少动态设置保存到当前 origin 的 `localStorage`，版本键为 `orbit-atelier.v1`。恢复时用现有关卡配置重建几何并校验存档；存储损坏或被禁用时可以在内存中继续游玩。
- 暂停、失焦和进入后台停止输入；最后一环的解锁结算在释放时同步完成，切后台不会丢失奖励。尺寸及全屏变化保留对局。
- 键盘补充操作：棋盘获得焦点后，上／下选择圆环，左／右每次旋转 10°，空格／回车尝试解开。
- 使用统一 `SmallGamesDev` 的 URL／存储开关。调试跳关与全关试玩不会写入玩家进度，退出试玩恢复原来的存档。普通启用调试面板后，从玩家入口进行的正常游玩仍按正常规则记录。

## 独立创作与实现

只参考旋转开口圆环、按顺序解开的抽象玩法。名称、工坊主题、SVG 图形、界面、音效、规则代码和 24 关配置独立创作，未导入 Rotate Rings 的源码、素材、界面截图、品牌或关卡。参考玩法不等于对第三方知识产权作法律结论。

`src/core.ts` 管理圆交点、缺口安全余量、星栓、释放与求解；`src/levels.ts` 管理稳定关卡 ID 和原创配置；`src/storage.ts` 校验存档与结算；`src/art.ts` 绘制圆环；`src/main.ts` 连接页面、原生 Pointer Events、音效和生命周期。运行时无第三方游戏引擎或远程资源依赖，公共开发者模式和全屏功能复用仓库实现。

设计稿和生产运行截图在 [docs/design](docs/design/README.md)。浏览器验证使用 Chromium、CDP 原生触屏与鼠标，覆盖 390×844、320×640、844×390、1280×900，以及 sandbox iframe。具体执行结果见 [browser-report.json](docs/design/browser-report.json)。这些是桌面浏览器移动模拟记录，尚未完成 Android／iOS 真机和原生小游戏平台验收。
