# 三维资产与来源

当前21个原生GLB、65,920三角面、6,640,468字节。全部模型由本地Blender脚本生成；Hyper3D生成物尚未下载接入。视觉仍未通过固定效果图验收，见[B3历史对照](../docs/design/b3-scene/README.md)。

重建顺序（游戏目录，使用Blender 5.2.1）：

```powershell
& D:/setup/Blender/blender.exe --background --python art/build_environment.py
& D:/setup/Blender/blender.exe --background --python art/build_falcon.py
& D:/setup/Blender/blender.exe --background --python art/build_variants.py
& D:/setup/Blender/blender.exe --background --python art/build_forest.py
& D:/setup/Blender/blender.exe --background --python art/build_ridges.py
& D:/setup/Blender/blender.exe --background --python art/build_moon.py
& D:/setup/Blender/blender.exe --background --python art/bake_surfaces.py
node --test tests/assets-terrain.test.mjs tests/flight-geometry.test.mjs
```

- `manifest.json`绑定模型边界、索引面数、字节、SHA与各自generator/sourceHash；基础脚本输出16个模型，Falcon覆盖/追加后由森林/山脊/月亮脚本更新对应项。`.blend`均为可编辑源，运行文件只保存在assets/resources。
- `falcon-manifest.json`：Falcon 4024面，七种共享PBR材质，双喷口x±1.18、y−0.16、z8.8；机体采样与实际跨度绑定。
- `forest-manifest.json`：原始透明枝簇与完整树冠图均为image_gen生成，源文件和SHA随仓库保留。近景单片20棵5360面；230m外改为相同布局的120面三交叉面片；1000m外裁切。MASK双面、共享纹理，不使用透明混合。
- `ridges-manifest.json`：两个侵蚀山体，各18,432面；3000m环形远景，与游戏地面分离。提高山体几何同时改树林LOD，浏览器总单帧面数由旧版约11–12万降到约8.6–9.9万，不代表真机帧率。
- `surfaces-manifest.json`：Blender四张烘焙纹理及生成器摘要；`granite-manifest.json`绑定原始生成岩壁纹理。三平面映射避免岩壁垂直拉伸；地形shader为当前项目编写的单pass光照/高度/坡度混合，使用Creator内建shader chunks。
- `lunar-manifest.json`：经纬UV球体与NASA LROC色彩图；来源、署名及使用说明见[LUNAR-SOURCE.md](LUNAR-SOURCE.md)，不把外部月面数据标为原创。
- `panorama-manifest.json`：生成远景；镜像两次闭合天空圆柱，起始偏移避免正前方镜像接缝。水面采样同一远景作环境反射，不宣称屏幕空间或真实近景反射。

可玩地形仍使用20m格子、49个320m回收网格，渲染与碰撞采用同一三角插值；连续河道水位18m同时参与机体、相机、敌机和弹道表面判断。森林/岩石使用保守包络，非逐三角机体碰撞。全部预算、真实资源有效性与河岸/接缝在测试中检查。

`exhaust.effect`提供淡出双喷口尾焰；`sky-no-fog.effect`避免天幕被地形雾覆盖；岩壁、月亮和水面均是实际Creator渲染资源。自然林海密度、地形构图、飞机材质和空气层次仍有差距，继续在本轮修正。

## B4机体与任务插画

`build_variants.py`来源为主会话的外部`nullrange-art/craft-variants/`原创建模源，已适配当前art/与唯一运行GLB目录并重新生成，未复制旧sourceHash。`variants-manifest.json`绑定本次生成器SHA256 `cb2fa5057c62d0a3da6cee913e3ba473f4724a273d453828d00bb49035653d38`。

- Kestrel：3272面、161112字节，窄翼/前鸭翼，喷口x±.72、y−.1、z7.1，GLB SHA256 `5bff55a58e7e1643ee079ca7b0a30f746bb774bf7fb9146ff5829a04f72579ea`。
- Warden：3816面、174608字节，宽折线三角翼/翼下装甲舱，喷口x±1.5、y−.1、z8.05，GLB SHA256 `683241832d0e4adac727c15b34c2fc925588b512ceb9a369b4e82d582206a054`。
- 原19个模型和森林LOD保留。总预算以本次实际65920面为断言，单山≤20000，其余≤6000；只实例化选中的机体并缓存，切换后不重复创建。实际GPU计数在TEST_REPORT记录，与作者模型总面数分别核算。
- `mission-atlas-manifest.json`：主会话 image_gen `exec-f3359e61-1442-4c09-a3d7-9dc5d2730b0c`，2048×768，SHA256 `6fc3e0fe0950e6daa615cfb245cf0bdac3bc3a53a18b590a14b27d45cfea2299`。按[0,683,1365,2048]横边界、384高裁切；两排分别为巡航/拦截/回收、护航/火网/精英。原生SpriteFrame加载一次、真实任务显示，无预裁重复文件。

这张图是任务概念插画，不是玩法截图；实际护航运输机使用本作Warden衍生渲染，插画中的大型运输机不是新的可驾驶机型。机体和整体场景的最终材质/光照验收继续开放，未下载Hyper3D。
