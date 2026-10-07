# 原生宿主页与触控设计

六页概念图先于原生UI代码保存。沿用纸色、深青和珊瑚按钮，真实世界仍由原Scene中的全部建筑/生活/交通/物理资源渲染。生成图只确定布局，照片寻景四关、设置选项和收藏状态以原配置为准，不添加角色语音或其它未实现功能。

横屏承载，宿主工程配置landscape。物理竖屏Canvas提供完整逻辑横屏映射，在同一个WebGL场景+HUD统一旋转，不依赖浏览器全屏/DOM。宿主胶囊及safeArea约束HUD，主要命中区域至少44逻辑屏幕像素；核心玩法以摇杆移动、单指环顾、双指缩放、跳跃、拍照和附近对象点击完成。

主页/地图/路线/照片寻景/手记/设置为明确页面，回退清晰，无多层对话框。游玩仅目标、地图/暂停、摇杆和动作。暂停清除全部触点，恢复必须重新接触，旋转、后台、返回主页保留Scene、镜头与已保存进度。设置/帮助滚动内容与固定返回动作分离。新原生入口复用原存档键与PhotoHunt解锁/站位/视角/真实已加载地标判断。

UI由真实宿主离屏Canvas2D绘制纹理，叠加到同一个Three WebGLRenderer的正交HUD pass；不是H5页面、iframe或WebView。主世界直接挂载原Scene（构建生成副本仅改资源/离屏Canvas/音频边界）。Three0.180需要真实WebGL2，Rapier0.19.2需要包内真实WASM实例。缺少必需能力明确报TRAVEL_UNAVAILABLE，不启动替代游戏。

声音使用构建生成的真实wav和宿主InnerAudioContext，可选能力不可用则显示静音；拍照保存/系统分享按真实API配置可用性说明，不假奖励/登录/匹配。截图不包含HUD，拍照检验沿用真实framePhotoPose。

官方依据：Three WebGLRenderer文档 https://threejs.org/docs/pages/WebGLRenderer.html；R3F自定义Canvas/root文档 https://r3f.docs.pmnd.rs/api/canvas。平台资源/WASM接口由平台native-resources.mjs核实与包装，游戏只读真实ArrayBuffer与实例exports。
