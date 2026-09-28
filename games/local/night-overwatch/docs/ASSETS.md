# 素材台账

全部资产由本项目原创代码生成，无第三方素材采购、外部上传或付费生成。可编辑源文件是对应 TypeScript / JavaScript；未使用 Draco、KTX2 或外部解码器。

| assetId | 来源 | 构成与预算 |
| --- | --- | --- |
| terrain.ground / ridges | World.ts | 按三角面烘焙明暗的起伏山地、低模岩石与路肩 |
| terrain.roads / markings | World.ts | 16 节点连续路面、弯道接缝、中心虚线与待命标线 |
| terrain.water / structures | World.ts | 河道、水面纹理几何、跨河桥梁护栏、村屋和通信塔 |
| terrain.fields / roofs / forest / details | World.ts | 农田垄沟、坡屋顶、分层松树、门窗和塔架；静态物体按材质合批 |
| vehicle.rescue / escort / light / heavy / turret | World.ts + core/Data.ts | 共享车型网格；圆轮、轮毂、玻璃、车厢、炮塔/炮管；每辆单独热值材质 |
| zone.shelter / exit | World.ts + HUD.ts | 保护区边界、标志、撤离营地和帐篷；伤害保护独立于外观 |
| prop.beacon / beaconFallback | generate-assets.mjs / World.ts | 原创 glTF 灯塔：12 面共享网格、3 实例；保留程序化后备 |
| fx.impact / tracer | Effects.ts | 最多 16 弹道、24 爆炸、8 条敌方攻击、8 个残骸烟；复用 Graphics，无持续新增节点 |
| fx.warning | HUD.ts | 方框友军、菱形敌人、红色友方文字、独立误伤条；按真实风险显示 |
| audio.rapid / blast / heavy / hit / alert | generate-assets.mjs | 原创确定性噪声与正弦波，22.05kHz 单声道 16bit PCM |
| audio.impact1 / impact2 / engine | generate-assets.mjs | 独立弹着爆炸声与两秒无缝引擎循环；Cocos AudioSource 管理、可整体停止 |

模型 +Y 为上、车辆 +Z 为前；游戏单位采用统一比例，不模拟现实武器参数。静态批次限制为 65,535 顶点以内；车辆网格共享，重试销毁实例与独立材质，场景销毁释放自建网格/材质。GLTF 失败仍有实际后备模型。

热成像按各实体热值、命中闪光、残骸冷却显示；日光模式用独立地形色。FX 热成像从白热转灰，日光从火球转烟尘。实际 draw calls、面数、加载量和浏览器截图见 STATUS.md 与 reports；这里的上限不等于硬件性能实测。

来源许可：原创源码遵循项目许可；Cocos 与系统字体沿用其各自许可，不打包系统字体文件。没有第三方署名要求。未调用 Hyper3D，未声称取得外部 AI 模型。

所有素材的实体手机 GPU、微信、抖音宿主验证均尚未进行。
