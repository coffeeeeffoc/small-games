# 外滩 · 空中漫游

保留 `assets/bund/source/bund-environment.blend` 的原始场景布局。相机沿黄浦江经过外滩、苏州河口与陆家嘴；场景自身不移动。

## 飞行

默认停在全景，滚动或向上滑动才开始推进；反向操作可以沿原路退回。取消开场的进度死区，第一格滚轮即有可见位移，滚轮的像素、行和整页单位统一处理。左右拖动可在原处环顾约 ±26°，点击「视角归正」或继续推进后回正；手势开始后锁定横向或纵向，支持取消和失焦释放。

路线保留三次 B 样条和连续转弯；高空赶路较快，外滩和陆家嘴附近降低机位并收紧取景。五个风景停靠点可直接选择，长距离跳转限制速度后平滑收尾，避免瞬移。拖动时紧跟手指，松手后短暂缓停。

点击「开始飞行」可自动走完约 48 秒路线，支持 0.5/1/2 倍速。空格暂停、方向键微调、Home/End 前往首尾，原生进度条也可用键盘操作。减少动态效果偏好下，手动跳转立即生效，关闭倾斜、文字入场和提示动画。

## 从轮廓到细节

- 首屏只加载全城轻量轮廓，保持原来的建筑位置、比例与天际线；河面及大范围地表一直保留。
- 按 700 米街区切分原始细节，进入约 1.9 公里范围时，结合后续飞行位置提前请求，最多同时加载两个区块。
- 进入约 1.3 公里范围后，街区用约 1.3 秒渐入完整立面与设施；拉远至 1.55 公里后退回轮廓，避免在边界反复切换。过渡结束后保持清晰，不停留在半显示状态。
- 空气雾化降低远景对比度。远离的细节区块释放 GPU 资源，返回时可以重新加载。
- 某个街区加载失败时保留轮廓，提供重试按钮；不会中断飞行。

本次保留上一版已确认的场景快照（素材仓库 `d1f098d`），不会修改 Blender 源文件。近景保留 3,484,074 个原始三角形；远景简化为 366,166 个，首屏模型由 81.8 MB 降至 20.7 MB。PBR 材质、AgX 色调映射及日光照明用于浏览器，Cycles 程序化材质和离线光线追踪效果不会完全相同。

## 命令

```powershell
pnpm --filter @coffeeeeffoc/travel-bund-25d dev
pnpm --filter @coffeeeeffoc/travel-bund-25d build
pnpm --filter @coffeeeeffoc/travel-bund-25d test
pnpm --filter @coffeeeeffoc/travel-bund-25d test:browser
# 从完整 Blender 源文件重建轮廓和原始细节分区
& 'D:\setup\Blender\blender.exe' --background --python-exit-code 1 --python games/local/travel-bund-2.5D/scripts/prepare-lod.py
```

预览端口 4187。`public/lod/manifest.json` 记录源文件快照 SHA-256、各分区位置、完整及轮廓三角形数量。重建时读取当前源文件的副本；如果素材版本改变，需重新确认场景并更新测试中的快照值。测试核对导出几何数量、路径速度连续性、帧率无关缓动、远近加载及倒退。浏览器截图在 `.scratch/bund-flight/`。真机性能与线上发布尚未验证。

技术参考：[Three.js 曲线弧长取样](https://threejs.org/docs/pages/Curve.html)、[按距离调整细节](https://threejs.org/docs/pages/LOD.html)。

地图数据 © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，见 [素材署名](public/ATTRIBUTION.md)。
