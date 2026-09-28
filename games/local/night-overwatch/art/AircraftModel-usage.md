# AircraftModel

World 已接入构造、逐帧姿态更新和销毁；Overwatch snapshot 暴露 `status/error/triangles/muzzle`。当前资产为 **2132 tris**，已通过 Blender 导出验证；`88d68995` 构建在 1366×768 与 844×390 实际浏览器均加载为 `ready`，截图及只读快照在 `reports/flight-overhaul/`。

## 资源与姿态

- 运行时：`resources.load('models/aircraft/cabin', JsonAsset, ...)`；文件为 `assets/resources/models/aircraft/cabin.json`，结构 `{positions,normals,colors,indices}`。单网格、RGBA 顶点色、`builtin-unlit / USE_VERTEX_COLOR`，无外部纹理或场景灯依赖。
- 坐标：Cocos Y-up、前方 +Z、左舷 -X，1 单位 = 10 米。炮口固定 `(-1.8,-1.1,1.2)`，炮管朝左下 45°；模型不镜像、不贴屏。
- `update(aircraft, yaw, pitch, direction)` 接收 Simulation 原始弧度，内部使用 `T(position) × Ry(yaw) × Rx(-pitch)`；正 pitch 为爬升，direction 不增加旋转。`worldMuzzle` 应与 `Flight.muzzlePosition` 一致，父级保持世界坐标与单位缩放。
- 推荐固定相机挂点 **`(0.4,-0.8,-0.55)`**，也按上述完整姿态变换（包含非零 mount.x）。默认观察方向、70° 垂直视场的 Blender 预览：炮口约 `(16.3%,22.5%)`，模型遮挡约 5.10%，中央区域无遮挡；这不替代游戏内各视角验收。
- `ready` Promise 始终 resolve，须检查 `status`；加载失败为 `error` 并记录原因。World 负责 `dispose()`；模块释放独占网格、材质及节点。
- 独立 `models/aircraft/house`（332 tris）、`models/aircraft/pine`（88 tris）已导出；不由 AircraftModel 加载，村落暂沿用 World 几何。

## 重建与验证

来源：**original Blender**，Blender 5.2.1；参考 `docs/design/flight-concepts.png`。源文件 `art/aircraft-assets.blend`；GLB、预览、来源和验证记录均在 `art/`。

在 PowerShell 执行：

```powershell
Set-Location 'C:/Users/15211/.codex/worktrees/night-overwatch-flight/small-games/games/local/night-overwatch'
# 重建源模型、GLB、runtime JSON、预览并验证
& 'D:/setup/Blender/blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/model-aircraft.py
# 校验源模型/JSON一致性、三角/索引/法线/颜色、无纹理GLB及实际回读
& 'D:/setup/Blender/blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/model-aircraft.py -- --verify
# 仅生成相机方案预览和射线遮挡统计，不改runtime资源
& 'D:/setup/Blender/blender.exe' --background --factory-startup --python-exit-code 1 --python scripts/model-aircraft.py -- --camera-study
```

`art/validation.json` 记录当前网格统计、SHA-256 与通过状态；`art/camera-study.json` 记录构图测量。实际构建已确认当前 2132-tris 资产加载、相机挂点效果、旋转观察与暂停恢复；炮口/弹道一致由核心检查及浏览器发射点快照验证。证据在 `reports/flight-overhaul/interaction-results.json` 及两视口 `*-preview.json`。
