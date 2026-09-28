# 素材台账

运行资产由本项目原创代码及本地 Blender 建模生成，无第三方素材采购或外部上传。可编辑源包括 TypeScript / JavaScript、Blender Python 和 .blend；未使用 Draco、KTX2 或外部解码器。布局效果图由内置 imagegen 生成，仅作设计参考，不作运行背景。

| assetId | 来源 | 构成与预算 |
| --- | --- | --- |
| terrain.ground / ridges | World.ts | 按三角面烘焙明暗的起伏山地、低模岩石与路肩 |
| terrain.roads / markings | World.ts | 16 节点连续路面、弯道接缝、中心虚线与待命标线 |
| terrain.water / structures | World.ts | 河道、水面纹理几何、跨河桥梁护栏、村屋和通信塔 |
| terrain.fields / roofs / details | World.ts | 农田垄沟、坡屋顶、门窗和塔架；静态物体按材质合批 |
| terrain.forest | World.ts / scripts/model-trees.mjs | 620 棵近景与 1399 棵远景树，暗绿不规则叶簇、冠缘缺口、裸露树干、分叉与倾斜，混合常绿/阔叶轮廓；240216 三角面、约 8.44MB 几何缓冲，复用原材质合批，无新增贴图；补偿 ACES 暗部压缩后，以实际截图复核树冠暗于地面且仍有层次，热成像保持冷暗 |
| vehicle.rescue / escort / light / heavy / turret | World.ts + core/Data.ts | 共享车型网格；圆轮、轮毂、玻璃、车厢、炮塔/炮管；每辆单独热值材质 |
| zone.shelter / exit | World.ts + HUD.ts | 保护区边界、标志、撤离营地和帐篷；伤害保护独立于外观 |
| prop.beacon / beaconFallback | generate-assets.mjs / World.ts | 原创 glTF 灯塔：12 面共享网格、3 实例；保留程序化后备 |
| aircraft.cabin | scripts/model-aircraft.py / AircraftModel.ts | Blender 原创舱壁、炮管、支架；顶点色运行网格，机体固定坐标炮口与弹道共用位置；源文件 art/aircraft-assets.blend |
| house / pine | scripts/model-aircraft.py | Blender 原创村屋/松树已导出 GLB 与运行 JSON；当前场景仍使用 World.ts 生成的村屋和树林 |
| fx.impact / tracer | Effects.ts | 最多 16 弹道、24 爆炸、8 条敌方攻击、8 个残骸烟；落空也绘制弹着，短曳光与细长弹体按口径区分；复用 Graphics，无持续新增节点 |
| fx.warning / fire-control UI | HUD.ts | 原创火控席布局；青绿方框友方、琥珀菱形敌方，红色仅表示危险；命中、击毁、低伤与落空来自真实弹着事件 |
| audio.rapid / blast / heavy / hit / alert | generate-assets.mjs | 原创确定性噪声与正弦波，22.05kHz 单声道 16bit PCM |
| audio.impact1 / impact2 / engine | generate-assets.mjs | 独立弹着爆炸声与两秒无缝引擎循环；Cocos AudioSource 管理、可整体停止 |

模型 +Y 为上、车辆 +Z 为前；一世界单位为10米，速度与重力按同一尺度计算，不复刻特定现实武器参数。静态批次限制为 65,535 顶点以内；车辆网格共享，重试销毁实例与独立材质，场景销毁释放自建网格/材质。灯塔 glTF 失败有后备模型；新增机舱加载失败会报告错误。

热成像按各实体热值、命中闪光、残骸冷却显示；日光模式用独立地形色。FX 热成像从白热转灰，日光从火球转烟尘。实际 draw calls、面数、加载量和浏览器截图见 STATUS.md 与 reports；这里的上限不等于硬件性能实测。

来源许可：原创源码遵循项目许可；Cocos 与系统字体沿用其各自许可，不打包系统字体文件。没有第三方署名要求。未调用 Hyper3D，未声称取得外部 AI 模型。

所有素材的实体手机 GPU、微信、抖音宿主验证均尚未进行。
