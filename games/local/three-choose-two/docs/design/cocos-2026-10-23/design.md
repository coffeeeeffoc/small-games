# 三块选两块 Creator 迁移

2026-10-23，按用户已确定方案实施。唯一活动发布入口为 Creator 3.8.8 Web Mobile；TypeScript 场景使用 Sprite、Graphics、Label、input、AudioSource。旧 main.mjs/style.css 是历史外观参考，native/canvas.mjs 继续供既有消费者使用。

沿用 ../garden-2026-10-07/actual-v2/ 花园版实际画面及 ../review-2026-10-11/ 最新选关画面；不使用 refresh 简洁版。garden、logo、hero 原素材复用。120 关以每页 30 关纵向滚动；手机竖屏为主，短屏压缩装饰而保留热区，横屏可滚动。删除全屏控件和注入。

reset-concept.png 来源为主会话 imagegen 在原图基础的局部编辑；源文件 exec-b1cb1e39-ed6b-434d-b1e5-2642e102a724.png。只参考重置面板，整体比例以旧实机为准。

重置选项确认文案：完整观看视频后，更换尚未放置的积木。棋盘和当前进度保留。按钮为“看广告并重置”和“取消”。本地关卡及两种无尽可用，在线和同种子挑战禁止。只替换未用候选，保留星标数量、棋盘、分数、组、目标和正常随机流。已重置对局不再宣传为同种子公平挑战。

调用 SmallGamesRewardAds.offer / ThreeChooseTwoHost.ads，无 ID unavailable，无假成功。请求绑定局面、代数，完成只发一次；隐藏保留请求，退出/取消/重开/销毁失效。开发测试 provider 只允许统一 dev 模式显式注入。

src/*.mjs 保持服务端及 legacy native 单一规则源，确定性生成 Creator JS 副本。存档 key 不变，统一 SmallGamesDev 开发试玩隔离正式进度，保留 ThreeChooseTwoDev 和 getThreeChooseTwoSnapshot。

受影响调用者：本游戏 Web 构建/类型/手机/分享回归，旧服务端规则和原生消费者继续使用未改引擎；新增 rewards 不进入服务端。公共 CI/registry/publication 由主会话完成。检查串行，浏览器一 worker；真实 Creator、浏览器 fixture、平台 SDK、手机真机和最终发布分别记证据。
