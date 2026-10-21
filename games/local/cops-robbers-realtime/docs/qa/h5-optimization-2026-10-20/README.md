# 街区围捕 H5 图片与静态画布优化验收

基线：`f3881ea5004177f81a946f3a939efc8dbdcd1c9b`。以下记录来自该基线上的隔离工作区；被测源码摘要见 [manifest.json](manifest.json)。最终提交的准确 SHA、增量候选验证和远端 CI/Pages 状态以交付记录为准。

## 发布图片

原始 PNG 保留在 `src/assets`，使用 Pillow 10.3.0 / libwebp 1.3.2 生成 lossless WebP。首页和角色图集改用 WebP，构建只排除这两张原 PNG。图集尺寸、裁剪坐标和美术内容不变。转换与质量检查都是可选命令，不加入普通构建。

| 文件 | 原 PNG 字节 | 发布 WebP 字节 | 尺寸 |
| --- | ---: | ---: | --- |
| home-city | 2,445,871 | 1,826,598 | 1672×941 |
| characters | 1,842,445 | 1,249,630 | 1280×1280 |
| 合计 | 4,288,316 | 3,076,228 | 减少 1,212,088 字节（28.26%） |

完整 dist 文件合计由 4,680,306 降到 3,468,462 字节。这里是文件大小，非 ZIP 大小。压缩率是本次素材的实测结果。

[image-quality.json](image-quality.json) 保存原图/发布图 SHA-256、尺寸、Alpha 一致性和黑白背景合成像素比较，两种背景均逐像素一致。透明像素中不可见的 RGB 不作保留承诺。实际手机比例首页 [优化前](baseline-home.png) / [优化后](release-home.png) 已目视比较；浏览器截图最大通道差 2/255、PSNR 57.68 dB，未发现细节、透明边缘、裁剪或布局退化。

在游戏目录复现：

```sh
python scripts/optimize-images.py --report outputs/image-quality.json
python scripts/optimize-images.py --check
pnpm build
```

## 冷启动和画布

环境：Windows，Chrome 155.0.8059.82，无头独立浏览器 context，390×844、DPR 1、触屏模拟。冷启动每版 5 次、每次新 context 并禁用缓存；80 ms 网络延迟、500,000 bytes/s 下载/上传、4 倍 CPU 限速。基线 dist 在源码修改前从上述基线构建并保留。就绪时间从导航开始到页面 load、图片 decode 和两次 RAF 后读取；不是实际网络或真机耗时。

| 指标 | 基线 | 优化后 |
| --- | ---: | ---: |
| 冷启动就绪中位数 | 9695.6 ms | 7267.0 ms |
| 冷启动就绪 P95（5 次中的最大值） | 9710.9 ms | 7308.7 ms |
| 首页 30 秒游戏 Canvas 绘制数 | 1801 | 0 |
| 选关 30 秒游戏 Canvas 绘制数 | 1797 | 0 |
| 固定场景 10 秒绘制数 | 600 | 600 |
| 帧间隔中位数 / P95 | 16.7 / 17.0 ms | 16.7 / 16.9 ms |
| 最大帧间隔 | 23.5 ms | 17.6 ms |
| 超过 50 ms 的帧间隔 | 0 | 0 |

固定场景为 quick 第 1 关，不下达指令，整个采样期保持 playing；帧间隔测试不做 CPU/网络限速。小样本只说明此场景未见回退，不保证所有设备或关卡帧率。

只在 `screen === 'game' && !document.hidden` 时执行游戏画布绘制及悬停更新，保留既有 RAF 链、固定模拟步长、HUD、背景缓存和生命周期。没有声称静态页面完全停止 RAF 或所有 CPU 工作。

浏览器实测通过：首页→选关→游玩；三次暂停/恢复并交替修改视口尺寸；暂停计时不变且零绘制，恢复未吸收暂停期间时间；真实触屏下达指令后胜利；终局仍有 16 次动画绘制，随后结算页面停止游戏画布；返回首页。恢复/尺寸变化后最多一个游戏 RAF 待执行，同一 RAF 时间戳没有重复绘制。

截图：[游玩前](baseline-game.png)、[游玩后](release-game.png)、[选关](release-levels.png)、[暂停](release-pause.png)、[捕获动画](release-capture.png)、[结算](release-win.png)。实际画面已检查暂停图标为分离的两根实心竖条。

[performance.json](performance.json) 为完整成功复测。保留 [first-attempt.json](first-attempt.json)：初次测试使用异步 waitForFunction，Promise 被当作真值导致胜利等待提前结束；修改为 expect.poll 后完整复测通过，初次数据不作为最终通过证据。

复现性能检查时，先在独立基线目录构建同一基线，将其完整 dist 路径赋给 `BASELINE_DIST`，然后在当前游戏目录执行 `pnpm test:performance`。可用 `PLAYWRIGHT_EXECUTABLE_PATH` 指定已准备的浏览器，`PERFORMANCE_OUTPUT` 指定输出目录。不提供 BASELINE_DIST 时只验当前版本。

## 其他验证和限制

- 游戏规则测试 61/61 通过。
- [safe-area.json](safe-area.json)：320×568、390×853（DPR 2.4）、844×390、568×320、390×844，以及 iframe 安全区/触控映射通过；SDK 数据由测试 fixture 提供。
- [shell-entry.json](shell-entry.json)：定向两款游戏的 Shell 嵌入、返回与独立手机触屏入口通过。
- 开发者模式副本静态检查 64 款、单元测试 5/5 通过。[dev-mode.json](dev-mode.json)：两款游戏的独立/Shell 默认关闭、URL/存储启用、显式关闭，以及脚本既有的乌龙城触屏/跨源 iframe fixture，共 18 项通过。额外 fixture 是现有检查的固定依赖，没有运行全仓浏览器回归。
- 只涉及 H5；未恢复已取消的原生/Cocos 版本，未改变服务器、身份、广告或奖励规则。
- 未执行物理手机、真实平台 SDK、实际移动网络验证。冷启动与安全区结果不能称为真机验证。
