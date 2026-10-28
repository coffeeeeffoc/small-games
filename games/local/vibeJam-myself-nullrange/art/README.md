# B2 原创三维资产

这是本地 Blender 资产接入阶段，不是目标图视觉验收通过。没有下载或使用 Hyper3D 模型。环境最初来源为主会话 `nullrange-art` 暂存区；Falcon 来源为其中的 `hero-refinement`，在本工作树补齐 UV、外向法线及可重生成输出。

按顺序运行（游戏目录）：

```powershell
& D:/setup/Blender/blender.exe --background --python art/build_environment.py
& D:/setup/Blender/blender.exe --background --python art/build_falcon.py
& D:/setup/Blender/blender.exe --background --python art/bake_surfaces.py
node --test tests/assets-terrain.test.mjs tests/flight-geometry.test.mjs
```

环境脚本输出16个GLB、环境 `.blend` 与基础清单；Falcon脚本追加第17个GLB，保存 `falcon.blend`、独立清单，并更新总清单。材质脚本输出三张1024² albedo JPG和共享512² normal PNG，另保留可编辑 `nullrange-surfaces.blend`。实际运行文件仅在 `assets/resources/`，这里没有重复GLB/贴图、旧PNG、日志、预览或 `.blend1`。

- [manifest.json](manifest.json)：模型边界/三角面/字节/SHA；顶层 sourceHash 对应环境脚本，Falcon记录的 generator/sourceHash 对应独立脚本。[falcon-manifest.json](falcon-manifest.json)保留该主机来源。
- [surfaces-manifest.json](surfaces-manifest.json)：四张烘焙材质与脚本哈希。
- [panorama-manifest.json](panorama-manifest.json)：主会话提供的生成全景，PNG原始字节、尺寸与来源。只作为不可到达的远背景。
- 所有模型米制、Y-up、机头-Z；Creator实际资源映射 `models/<name>/<name>` → Prefab。所有子节点递归设置DEFAULT 3D layer，保留标准PBR并共享材质/网格。林块每块10棵，4个材质；中距离改用单树LOD，700m外裁切，按确定格子回收实例。
- 当前Falcon 4024三角面，7种PBR材质；双喷口中心x±1.18、y−0.16、z约8.7，表现火焰从该位置后方延伸。模型比例与碰撞有限采样在 `core/flight-geometry.ts` 绑定。
- `alpine-terrain.effect` 改自 Creator 3.8.8 `builtin-standard.effect`，保留原版权声明与PBR/雾/光照代码，只改为按坡度/海拔混合绿地、层理岩石和雪线。`sky-no-fog.effect` 是简化天空shader，明确不应用全局雾；镜像采样以偶数次数闭合，纹理边缘夹取避免左右原图不连续。

实时地形采用20m格子的同一三角形高度插值，49块320m地块只在越界时回收；机体和追尾相机均检查实际地形/林岩体积。背景山脊始终位于以观察者为中心的1850m环上，处于可玩地形之外，不承担近景障碍。地形、树、岩的碰撞包络保守；它不是逐三角形机体碰撞。

继续存在的视觉差距：真实场景仍以程序化模块为主，山谷断崖密度、植被丰富度、云雾体积感、飞机高频细节及整体光影未达到目标图。Hyper3D下载/整合等待用户指示；B3继续UI与视觉收敛，不能把本目录的建模成功当最终美术通过。
