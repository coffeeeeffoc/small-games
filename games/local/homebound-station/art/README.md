# 场景素材

- `station-concept-v2.png`：2026-10-03 内置 image_gen 生成的美术方向图，提示词见 `concept-prompt.md`。不是实机截图；不会打包成游戏背景。
- 站房、雨棚、时钟、护栏、车位、出租车、乘客：`src/scene.ts` 中的原创 Three.js 几何，保留真实行驶、排队、上车和开关车门。
- `public/art/broadleaf.glb`：复用本仓库 `assets/carding-car/runtime/broadleaf.glb`，701,420 字节，内嵌 512px 贴图。原始素材来自 Hyper3D Rodin Gen-2.5 High，来源记录见 `assets/carding-car/manifest.json`，优化参数见 `assets/carding-car/runtime/manifest.json`。SHA-256：`f6c3e7fc4bb1935245aa5be7e5ee429a0882a5ce1f3b30757bebc3242613d9f0`。
- `public/art/asphalt.jpg`：复用 `assets/carding-car/runtime/asphalt.jpg`，110,064 字节，原图通过 image_gen 生成。SHA-256：`35b6a975028ea5ed8369bd78e898847f07591c034dedc6f8840ee4752ede7ee2`。

源素材库 README 明确允许跨项目取用；本次保留来源，没有把素材宣称为公共领域，也没有修改源素材子模块。实际新生成的是场景效果图，树木复用已有 Hyper3D 成果。

选关页只加载游戏逻辑和界面。首次进入关卡时动态导入 Three.js 场景；可玩场景就绪后，再异步加载树木 GLB 和柏油贴图。四棵树共享几何与材质，重试关卡复用已加载资产；网络失败时保留轻量树和基础路面，并提供“重试细节”。暂停和弹窗期间不持续绘制三维画面。
