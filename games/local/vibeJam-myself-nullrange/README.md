# 零域 · NULL RANGE

当前为 [全面重构计划](../../../docs/plans/2026-10-29-nullrange-rebuild.md) 的 **B3手机交互与环境迭代版本**。原生Cocos全页面与四尺寸真实触屏、安全区、缓存和规则验证通过；画面验收仍未完成，机体质感、自然林海、山谷构图和空气层次继续跟进。本批推送不是完整游戏交付。

场景加载19个Blender GLB、5张显式纹理，含连续河道、实体岩壁、树林LOD和有署名的NASA月面；Falcon为4024三角面。Hyper3D已生成但尚未下载接入。固定[单机效果图](docs/design/target-mobile-v2.png)和[对战效果图](docs/design/target-online-v2.png)不变；[本批实测与逐页对照](docs/design/b3-scene/README.md)保留准确来源。按B4六任务/三机型、B5通用后端真人对战、B6完整画面与素材验收继续执行。

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

复用制品目录包含 `dist/`（含 `build-info.json`）和编辑器原始 `cc.d.ts`。设置 `NULLRANGE_PREBUILT_DIR` 后，`typecheck` / `build` 先验证 `sourceHash`、Creator版本、Game ID、声明哈希和完整逐文件清单；源码、依赖工具或文件变化均拒绝复用。`scripts/artifact.mjs` 导出 `sourceHash(directory?)`、`verifyPrebuilt(directory)`、`runtimeManifest(dist)`。`build` 和 `typecheck` 均将已验证的真实声明保存在游戏根 `cc.d.ts`，不提交它；下一CI步骤即使没有编辑器或不继承prebuilt环境变量，制品测试也可读取该声明。纯制品测试不再导入带进程执行能力的toolchain。

## 代码与生成物归属

| 路径                                  | 职责                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `assets/scripts/core/content.ts`      | 版本、稳定任务ID、任务配置与校验                                       |
| `assets/scripts/core/rules.ts`        | 固定60Hz确定性飞行、敌机、锁定、扫掠碰撞、热量、护盾、导弹、回收及终局 |
| `assets/scripts/core/progress.ts`     | 可选存储端口、旧best/muted迁移与版本化偏好                             |
| `assets/scripts/core/presentation.ts` | 安全区坐标变换、真实敌机雷达投影与基于任务结果的展示星级               |
| `assets/scripts/FlightInput.ts`       | Cocos Touch/Mouse/Keyboard，多指归属与释放/取消清理                    |
| `assets/scripts/World.ts`             | Camera、MeshRenderer、光照/雾、地形与模型加载点                        |
| `assets/scripts/UI.ts`                | 真实Cocos Canvas、Graphics、Label及布局/热区                           |
| `assets/scripts/NullRange.ts`         | 页面状态、固定步驱动、AudioSource、生命周期与开发快照                  |
| `scripts/prepare.mjs`                 | 可再生成 `assets/scenes/main.scene`、音效PCM和缺失元数据               |
| `scripts/sound-bank.mjs`              | 唯一音效生成器：10类确定性原创音效，替代旧单音生成                     |
| `startup/`                            | 自有加载图标、加载失败重试和Shell沉浸消息；无游戏DOM控件               |

`core/*.ts` 是唯一规则源码，直接供Node测试、未来服务端adapter与Cocos调用，不生成另一份规则。元数据、材质、工程配置是版本化输入。`main.scene`、`resources/audio/*.wav`、Creator的 `library/temp/build` 与 `dist/cc.d.ts/reports` 为生成物；场景和声音生成器本身参与源码摘要。

## 已实现操作与边界

- 首页左品牌、右侧完整主机、右下“单机任务”与“玩家对战”；后者明确显示未开放，可返回首页或进入单机，不模拟在线玩家。只有真实的一关任务与Falcon准备页，不摆放未来假卡片。单机不访问网络服务。
- 左摇杆转向/升降，松手回平；右侧开火/加速为长按，导弹/扫描为释放触发。桌面WASD/方向键、空格、Shift、E、Q、Esc补充。导弹只能锁定前方25°、900m内活目标。
- 脉冲12°辅助瞄准；热量过高停火；脱战恢复护盾；导弹6枚、冷却3秒；扫描6秒、冷却10秒；残骸补充护盾/能量和本机分数。
- 手机横屏布局，竖持由Creator旋转完整画布和输入坐标；合并 `sys.getSafeAreaRect(false)` 与Web CSS `env()`实测安全区，旋转时转换物理边距。四目标尺寸的控件至少44 CSS px且不重叠。触控取消、拖出、热旋转清理输入；失焦/后台暂停，恢复需主动继续，不补算离线时间。
- 设置提供音效、减弱动态和灵敏度。旧 `nullrange-cn-best` / `nullrange-cn-muted` 只迁移合法分数与布尔偏好，不推断旧任务进度。新数据键 `nullrange-progress-v1`；存储不可用仍可玩。
- HUD圆形双拇指控件带冷却、不可用、热量/能量反馈；右上雷达显示当前活敌机的真实相对方位，暂停图标为两实心竖条。设置从暂停返回仍暂停。结算显示真实成绩；星级只按完成任务及剩余机体≥50%/≥80%计算，不授予虚构奖励。
- 10类音效合计427774字节；独立可停止的AudioSource保证静音、暂停和退出清理。已做生成自检与浏览器生命周期断言，尚未听感/真实设备验收。正式无字图标已接入加载页，来源见上架清单。
- 开发模式复用[统一契约](../../../docs/game-dev-mode.md)，默认关闭。仅启用时提供只读 `__nullrange.snapshot()`，浏览器验证通过真实输入驾驶；开发试玩不写最高分。

## 后续批次与共享整合

B2原生GLB实际路径为 `models/<name>/<name>`，由 `World.MODEL_NAMES` 统一加载。来源、建模脚本、可编辑源与SHA清单见 [art/README.md](art/README.md)；不保留重复运行二进制。`core/terrain.ts` 让实时网格与碰撞共用20m网格三角形插值；`core/flight-geometry.ts` 绑定当前主机尺寸与Cocos姿态，检查中心/翼尖/机头/尾部净空，并为相机提供避让。

地形49块回收，B3林块20树合并并按距离切换单树LOD，MASK双面枝片保留导入贴图宏；材料/网格共享且GPU实例化实测生效。只读开发快照 `world` 给出17模型/5张显式纹理加载状态、叶片材质宏、错误、池与网格数量、实际draw calls和三角面。加载全部成功后才撤下加载页、接受开始输入，失败沿用45秒重试入口。B3保留了独立展示镜头、渐变尾焰及未验收的装饰水面/远山shader；未修改B2地形高度、机翼8点、相机避障、权威时钟与胜负规则。

B3尚需主会话完成场景视觉收敛及验收后发布；B4再扩展任务、敌型和机体并调节节奏（当前真实输入通关约5秒，不是2–5分钟目标达成）；B5使用通用服务 `Rule={initial,advance,action,view,result}`、`duel:true`两席共享状态和输入序号去重，新增游戏专属Duel适配。本批没有实现后端或宣称联网可用。

共享整合已接通：`NULLRANGE_PREBUILT_DIR` 进入 Creator 生产、复用、CI/Pages/Mobile消费者及Turbo；工具引用只允许准确构建/类型/制品测试边界。Shell通过真实Cocos输入、只读快照验证入口和沉浸返回，旧DOM选择器已移除。增量范围验证覆盖完整迁移、锁文件以及10个删除/2个精确移动，额外删除或错误移动仍阻断。本地Shell通过不代表远端CI/Pages成功。

验收结果见 [TEST_REPORT.md](TEST_REPORT.md)，上架资料核对见 [publishing/STATUS.md](publishing/STATUS.md)。
