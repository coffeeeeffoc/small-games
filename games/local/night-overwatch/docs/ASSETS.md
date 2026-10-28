# 素材台账

当前运行资产包含项目原创代码/Blender 模型、已有炮艇夜谷插画，以及2026-10-28通过内置 imagegen 为运行界面生成的透明金属标题、两组三任务插画与并行合入的面板/按钮/徽章皮肤。效果图与运行素材分别保留身份：设计效果图用于对照，运行 PNG 原图直接进入 Cocos resources；不将整张带界面的效果图覆盖为游戏。可编辑源包括 TypeScript / JavaScript、Blender Python、.blend 和 Cocos effect；未使用 Draco、KTX2 或外部解码器。

| assetId | 来源 | 构成与预算 |
| --- | --- | --- |
| ui.panel / ui.button / ui.insignia | 内置 imagegen，2026-10-28 | `assets/resources/ui/` 三张 PNG，面板与按钮按九宫格拉伸，徽章保持透明和比例；生成约束及使用边界见 [当前视觉规范](design/interface.md)，总文件约4.68MB，无新增付费素材或字体依赖 |
| terrain.ground / ridges | World.ts + resources/terrain-surface.effect | 保留物理高度场，追加世界坐标草土颗粒/坡面岩层材质；战区外山脊、光照与远景雾色重做 |

| terrain.roads / markings | World.ts | 16 节点连续路面、弯道接缝、中心虚线与待命标线 |
| terrain.water / structures | World.ts | 河道、水面纹理几何、跨河桥梁护栏、村屋和通信塔 |
| terrain.fields / roofs / details | World.ts | 农田垄沟、坡屋顶、门窗和塔架；静态物体按材质合批 |
| terrain.forest / distantForest / canopyShadows | World.ts | 本轮近树最多400棵、远景最多1440棵（布局剔除后以实际快照为准），层叠不规则针叶枝冠为主、少量阔叶树、地形贴合渐淡树影；按材质合批，每批保持16位顶点预算。旧版240216三角面/8.44MB记录不代表本次版本 |
| vehicle.rescue / escort / light / heavy / turret | World.ts + core/Data.ts | 共享车型网格；圆轮、轮毂、玻璃、车厢、炮塔/炮管；每辆单独热值材质 |
| zone.shelter / exit | World.ts + HUD.ts | 保护区边界、标志、撤离营地和帐篷；伤害保护独立于外观 |
| prop.beacon / beaconFallback | generate-assets.mjs / World.ts | 原创 glTF 灯塔：12 面共享网格、3 实例；保留程序化后备 |
| aircraft.cabin | scripts/model-aircraft.py / AircraftModel.ts | Blender 原创舱壁、炮管、支架；顶点色运行网格，机体固定坐标炮口与弹道共用位置；源文件 art/aircraft-assets.blend |
| house / pine | scripts/model-aircraft.py | Blender 原创村屋/松树已导出 GLB 与运行 JSON；当前场景仍使用 World.ts 生成的村屋和树林 |
| fx.impact / tracer | Effects.ts | 最多 16 弹道、24 爆炸、8 条敌方攻击、8 个残骸烟；落空也绘制弹着，短曳光与细长弹体按口径区分；复用 Graphics，无持续新增节点 |
| fx.warning / fire-control UI | HUD.ts | 深海蓝仪表玻璃、银钢装甲、黄铜主操作；浅蓝方框友方、红色菱形敌方，命中/击毁/低伤/落空来自真实弹着事件 |
| audio.rapid / blast / heavy / hit / alert | generate-assets.mjs | 原创确定性噪声与正弦波，22.05kHz 单声道 16bit PCM |
| audio.impact1 / impact2 / engine | generate-assets.mjs | 独立弹着爆炸声与两秒无缝引擎循环；Cocos AudioSource 管理、可整体停止 |

模型 +Y 为上、车辆 +Z 为前；一世界单位为10米，速度与重力按同一尺度计算，不复刻特定现实武器参数。静态批次限制为 65,535 顶点以内；车辆网格共享，重试销毁实例与独立材质，场景销毁释放自建网格/材质。灯塔 glTF 失败有后备模型；新增机舱加载失败会报告错误。

热成像按各实体热值、命中闪光、残骸冷却显示；日光模式用独立地形色。FX 热成像从白热转灰，日光从火球转烟尘。实际 draw calls、面数、加载量和浏览器截图见 STATUS.md 与 reports；这里的上限不等于硬件性能实测。

来源许可：原创源码遵循项目许可；Cocos 与系统字体沿用其各自许可，不打包系统字体文件。没有第三方署名要求。未调用 Hyper3D，未声称取得外部 AI 模型。

所有素材的实体手机 GPU、微信、抖音宿主验证均尚未进行。

## 2026-10-28 运行插画与材质

| 运行资源 | 来源与使用 |
| --- | --- |
| `assets/resources/ui/home.png` | 沿用已认可炮艇夜谷原画；首页、任务选择及基地大厅使用完整背景，战斗弹窗保留实时场景 |
| `assets/resources/ui/title-metal.png` | 内置 imagegen 原始透明 RGBA，2172×724；仅标题金属字/徽章，中文标题独立 Sprite |
| `assets/resources/ui/mission-day-atlas.png` | 内置 imagegen 原始 RGB，2172×724；白天河桥/高地/林谷三幅，前三任务各用不同帧 |
| `assets/resources/ui/mission-atlas.png` | 内置 imagegen 原始 RGB，2172×724；日出山谷/黄昏高地/月光林路，当前暮色与夜间任务使用对应帧 |
| `assets/resources/terrain-surface.effect` | 本项目原创 GLSL：草土/岩层/路面/水流/枝叶材质；热像使用原有热值配色，减弱动态停止水流时间扰动 |

三张新 PNG 均未二次绘图或重采样，生成原图完整保留在运行源目录。图集由 `SpriteFrame.rect` 切成724×724，以 Mask 等比裁切到卡片；关卡名、昼夜、敌数、选中/解锁状态均为实时文字。图像不替代地图或规则数据。

本轮通过真实Creator 3.8.8构建、306项测试及同源浏览器逐页对图；新增素材成功加载，shader在Chromium/SwiftShader实际编译运行，记录见[本轮验证](verification-2026-10-28-visual-rebuild.md)。移动设备性能及原生渠道仍未验收；不得沿用旧版本记录作本轮通过。运行只读快照 `visualMaterialStatus` 必须为 `ready`、`visualMaterialError` 为空；`error` 只表示回退可玩，不能验收新材质。
