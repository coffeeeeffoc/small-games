# 围捕小队 TapTap H5 广告位配置与打包

日期：2026-10-18。应用 ID `982507`，开发者 ID `492506`。

官方 MCP 1.24.14 的本次 `check_ads_status` 查询确认广告已生效，服务端 `/ad/v1/config` 返回 `status=1`。现有游戏采用竖屏，配置本次响应中 `type=2` 的广告位 `1054324`；横屏广告位不用于本包。开发者、应用与广告位保存在 Git 忽略的游戏目录 `.env`，凭证未写入源码或包体。[服务端响应与方向问题记录](taptap-ads-2026-10-18/server-config.json)。

MCP 的方向匹配仍有阻塞：`update_app_info(screenOrientation=1)` 返回成功，但随后实时读取的 `screen_orientation` 仍为 `0`，因此工具不能自动缓存广告位或生成指南。本次只读取该查询实际收到的服务端广告响应，按既有竖屏设计使用其 `type=2` 广告位，未修改 MCP 缓存、工具返回值或运行时。后台方向元数据尚未验证成功。

## 产物

- ZIP：`outputs/cops-robbers/cops-robbers-taptap-h5.zip`，936042 字节、40 个资源。
- 入口：`dist/index.html`；H5 包体，竖屏。
- SHA-256：`ebc03be09a70dd9b118bdd66c06b769dc06f7de3e404cc1d8d146c058c53c70e`。
- 包内配置为 `adMode=host`、`adsEnabled=true`、`platform=taptap-h5`、`adUnitId=1054324`。
- 未上传、绑定包体、提审或上线。

## 验证

执行 `pnpm --filter cops-robbers deploy:taptap -PackageOnly`：16 项广告、环境配置和上传边界单元检查通过，ZIP 资源清单、内容哈希及解压校验通过，准确解压包的 12 项 SDK 浏览器检查通过。

浏览器为 Windows Chrome 155.0.8059.82、Node 24.21.0，触屏视口覆盖 320×568、390×844、844×390。检查完整观看后提示、提前关闭、重复点击、缺少宿主、创建/加载/展示失败、返回、超时、前后台和迟到回调，页面无错误。测试保留包内真实广告位配置，仅替换 SDK，确认 `tap.createRewardedVideoAd` 实际收到 `1054324`，不再以测试广告位替换生产配置。

[SDK 报告](taptap-ads-2026-10-18/sdk-browser.json)、[包体清单](taptap-h5-package.json)、[320 截图](taptap-ads-2026-10-18/tap-hint-320.png)、[390 截图](taptap-ads-2026-10-18/tap-hint-390.png)、[844 截图](taptap-ads-2026-10-18/tap-hint-844.png)。已检查截图中的场景、触屏控件和提示高亮。

SDK 替身通过不代表 TapTap 宿主注入、真实广告填充或真机播放通过。后台方向元数据、H5 通道包体权限、平台上传及真实广告完成/取消仍需平台环境验收。
