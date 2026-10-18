别跑！街区围捕 · 宣传素材包
项目：cops-robbers-realtime
制作日期：2026-10-18（北京时间）

六份成品
1. promo-landscape-1920x1080.png：1920×1080 px 横版宣传图。
2. promo-square-1440x1440.png：1440×1440 px 方版宣传图。
   两图仅保留完整游戏标题「别跑！街区围捕」，没有副标题、宣传语、印章或其他附加文案。
3. screenshot-01-home-1080x1920.png：真实游戏首页。
4. screenshot-02-gameplay-1080x1920.png：真实街区挑战、选中警察后下达道路移动指令。
5. screenshot-03-victory-1080x1920.png：战术试炼3通关结果。
   三张截图全部为1080×1920 px、9:16，原始浏览器截图，未以AI画面代替游戏截图。
6. promo-video-1280x720.mp4：1280×720 px、29秒、30 fps、H.264/yuv420p、AAC。
   片头片尾为宣传图；中段为三段真实游戏触屏操作：桥口夹击、三岔收口、双街协作。
   移除选关菜单过场，保留原速玩法及结果；画面叠加文字只有游戏标题。
   配乐沿用本工作区原创合成轻音乐，没有引入外部音乐录音。

素材与实际验证
宣传图：内置image_gen生成，参考本游戏已有characters.png及home-city.png。
生成原图保留在source/，使用FFmpeg精确缩放到指定像素。
实际截图与游戏片段：Windows上真实运行的Chromium 153.0.8010.12。
CSS视口432×768，截图倍率2.5；触屏点击警察与道路，正常速度运行核心引擎。
未注入棋局/角色位置/存档，也未修改时钟；三个战术试炼均实际获胜，页面错误为0。
已核对两张宣传图仅有游戏标题；检查三张截图及视频6、10.5、15、23秒关键帧。
六份成品均通过精确尺寸检查，视频通过编码、帧率、时长及完整解码检查。
详细规格见manifest.json；抓取证据见source/capture-evidence.json。

边界
素材来自本地H5实际运行，未代表安卓/iPhone/微信/B站原生小游戏真机验收。
用户自行录制独立实机录屏，本包不包含该独立交付项。
未提交平台审核，不承诺平台审核结果。未修改游戏逻辑或界面代码，未提交或推送仓库。

复现
在游戏目录使用PORT=4190、COMPETITION_SERVICE_ENABLED=0运行node scripts/serve.mjs。
然后运行node docs/marketing/2026-10-18/capture.mjs。
再运行node docs/marketing/2026-10-18/render.mjs。
需要已安装的Playwright、FFmpeg/FFprobe以及Microsoft YaHei字体。
source/包含生成原图、游戏片段、配乐、字幕、抽检帧及原始提示词。
成品ZIP只放上述六份成品和本说明，便于选取文件提交平台。

2026-10-19 提交清理：正式成品、源素材及验证证据保留；重复宣传ZIP和可再生成的中间文件不纳入版本控制。原文件已按原相对路径归档至 small-games 根目录 outputs/archive/2026-10-19-pending-cleanup/，清单含 SHA-256。需要时从归档复制回原目录；字幕、滤镜等也可由 render 脚本重新生成。该本地归档不随 Git 推送。
