# 零域 · NULL RANGE

当前为 [全面重构计划](../../../docs/plans/2026-10-29-nullrange-rebuild.md) 的 **B1 技术阶段**：真实 Cocos Creator 3.8.8 工程，一关单机空战。几何战机与环境用于验证飞行、射击及完整胜负流程，**未通过最终视觉验收**。[单机概念图](docs/design/target-mobile-v2.png)、[玩家对战概念图](docs/design/target-online-v2.png)均不是运行截图。

Game ID `vibeJam-myself-nullrange`、包名 `null-range-mobile-cn`、独立入口 `/games/vibeJam-myself-nullrange/index.html` 和 `dist/` 保持。旧 Vite / Three / DOM 生产入口与测试已移除，历史原型可从 `8c4c821addb627e4196ccdc0b9437475e4b60f47` 找回。

## 构建与运行

仓库根使用 Node 24.21.0 / pnpm 12.6.0，安装现有锁定依赖。真实编辑器位置默认 `D:/tools/cocos/CocosCreator.exe`，可用 `COCOS_CREATOR` 指定 **3.8.8**。

```powershell
pnpm --filter null-range-mobile-cn test
pnpm --filter null-range-mobile-cn typecheck
pnpm --filter null-range-mobile-cn build
pnpm --filter null-range-mobile-cn dev
pnpm --filter null-range-mobile-cn test:browser
```

`dev` / `preview` 提供已经构建的 `dist/`，默认 `http://127.0.0.1:43170`，支持 `--host` / `--port`。日志、截图与浏览器报告在忽略的 `reports/`。没有安装编辑器时不能伪造引擎、声明或 runtime。

复用制品目录包含 `dist/`（含 `build-info.json`）和编辑器原始 `cc.d.ts`。设置 `NULLRANGE_PREBUILT_DIR` 后，`typecheck` / `build` 先验证 `sourceHash`、Creator版本、Game ID、声明哈希和完整逐文件清单；源码、依赖工具或文件变化均拒绝复用。`scripts/artifact.mjs` 导出 `sourceHash(directory?)`、`verifyPrebuilt(directory)`、`runtimeManifest(dist)`，供主会话接入共享Creator生产者与CI。`build` 自动输出本机的 `cc.d.ts`，不提交它。

## 代码与生成物归属

| 路径                              | 职责                                                                   |
| --------------------------------- | ---------------------------------------------------------------------- |
| `assets/scripts/core/content.ts`  | 版本、稳定任务ID、任务配置与校验                                       |
| `assets/scripts/core/rules.ts`    | 固定60Hz确定性飞行、敌机、锁定、扫掠碰撞、热量、护盾、导弹、回收及终局 |
| `assets/scripts/core/progress.ts` | 可选存储端口、旧best/muted迁移与版本化偏好                             |
| `assets/scripts/FlightInput.ts`   | Cocos Touch/Mouse/Keyboard，多指归属与释放/取消清理                    |
| `assets/scripts/World.ts`         | Camera、MeshRenderer、光照/雾、地形与模型加载点                        |
| `assets/scripts/UI.ts`            | 真实Cocos Canvas、Graphics、Label及布局/热区                           |
| `assets/scripts/NullRange.ts`     | 页面状态、固定步驱动、AudioSource、生命周期与开发快照                  |
| `scripts/prepare.mjs`             | 可再生成 `assets/scenes/main.scene`、音效PCM和缺失元数据               |
| `startup/`                        | 自有加载图标、加载失败重试和Shell沉浸消息；无游戏DOM控件               |

`core/*.ts` 是唯一规则源码，直接供Node测试、未来服务端adapter与Cocos调用，不生成另一份规则。元数据、材质、工程配置是版本化输入。`main.scene`、`resources/audio/*.wav`、Creator的 `library/temp/build` 与 `dist/cc.d.ts/reports` 为生成物；场景和声音生成器本身参与源码摘要。

## 已实现操作与边界

- 首页区分“单机任务”与“玩家对战”；后者明确显示未开放，不模拟在线玩家。单机不访问网络服务。
- 左摇杆转向/升降，松手回平；右侧开火/加速为长按，导弹/扫描为释放触发。桌面WASD/方向键、空格、Shift、E、Q、Esc补充。导弹只能锁定前方25°、900m内活目标。
- 脉冲12°辅助瞄准；热量过高停火；脱战恢复护盾；导弹6枚、冷却3秒；扫描6秒、冷却10秒；残骸补充护盾/能量和本机分数。
- 横屏优先，竖持由Creator旋转完整画布和输入坐标；控件目标至少44 CSS px。失焦/后台暂停，清理所有触点、键盘和累积时钟；恢复需主动继续，不补算离线时间。
- 设置提供音效、减弱动态和灵敏度。旧 `nullrange-cn-best` / `nullrange-cn-muted` 只迁移合法分数与布尔偏好，不推断旧任务进度。新数据键 `nullrange-progress-v1`；存储不可用仍可玩。
- 开发模式复用[统一契约](../../../docs/game-dev-mode.md)，默认关闭。仅启用时提供只读 `__nullrange.snapshot()`，浏览器验证通过真实输入驾驶；开发试玩不写最高分。

## 后续批次与共享整合

B2在 `assets/resources/models/player`、`models/drone`、`models/valley` 提供Prefab（GLB导入或Blender网格均可），`World.MODEL_PATHS` 为唯一资源路径；战机原点为中心、米制、机头沿-Z、Y向上。视觉模型不承担规则碰撞，地形必须保持与 `terrainHeight()` 的真实高度关系。

B3对照概念图完成精细UI/机库/完整视觉与安全区验收；B4扩展任务、敌型和机体并调节节奏（B1自动驾驶通关约5秒，不是2–5分钟目标达成）；B5使用通用服务 `Rule={initial,advance,action,view,result}`、`duel:true`两席共享状态和输入序号去重，新增游戏专属Duel适配。本批没有实现后端或宣称联网可用。

共享整合已接通：`NULLRANGE_PREBUILT_DIR` 进入 Creator 生产、复用、CI/Pages/Mobile消费者及Turbo；工具引用只允许准确构建/类型/制品测试边界。Shell通过真实Cocos输入、只读快照验证入口和沉浸返回，旧DOM选择器已移除。增量范围验证覆盖完整迁移、锁文件以及10个删除/2个精确移动，额外删除或错误移动仍阻断。本地Shell通过不代表远端CI/Pages成功。

验收结果见 [TEST_REPORT.md](TEST_REPORT.md)，上架资料核对见 [publishing/STATUS.md](publishing/STATUS.md)。
