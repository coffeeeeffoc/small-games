# 乌龙城 · TapTap Android APK

独立可安装 Android 应用：系统 WebView 离线渲染包内游戏，Java 接原生 TapADN 5.3.0.4 激励广告。它是 APK，不是 TapTap H5 ZIP 或 Tap 小游戏转换包；渲染层仍复用现有 HTML/Canvas，未改成 Java/Cocos 原生渲染。现有 `native/canvas.js` 的各小游戏渠道不受这个 APK 工程控制。

## 打包

需要 Node 24.21.0、JDK 17、Android SDK platform 34 / build-tools 34.0.0。Gradle wrapper 8.6 / AGP 8.4.0 与仓库原 Android 工具链一致；首次构建会下载 Gradle、Maven 依赖及官方 TapADN AAR。AAR 使用固定 SHA256 校验，不提交二进制 SDK 或账号配置。

在仓库根执行：

```powershell
$env:JAVA_HOME = 'D:\setup\Java\jdk-17' # 改成自己的 JDK 17 路径
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
pnpm --filter @coffeeeeffoc/wulong-city check:android
pnpm --filter @coffeeeeffoc/wulong-city build:android
```

输出 `games/local/wulong-city/android/dist/wulong-city-taptap-debug.apk`，调试包默认包名 `com.coffeeeeffoc.wulongcity.debug`。没有真实广告配置时不初始化 SDK、不显示广告按钮，也不会用模拟广告发奖。游戏完全可离线游玩。

正式包准备：复制 `release-config.example.json` 为已忽略的 `release-config.local.json`，填写全部字段；也可全部使用同名环境变量（优先于配置文件），外部 JSON 通过 `WULONG_ANDROID_CONFIG` 指定。不要提交媒体 key、签名文件或密码。

```powershell
# 先检验正式配置，不进行构建
./games/local/wulong-city/scripts/build-taptap.ps1 -Release -Check -Config 'C:\private\wulong-android.json'
# 构建、lint、Java 奖励状态测试、签名与包名验证
./games/local/wulong-city/scripts/build-taptap.ps1 -Release -Config 'C:\private\wulong-android.json'
# 等效包命令：pnpm --filter @coffeeeeffoc/wulong-city build:android:release
```

正式产物 `android/dist/wulong-city-taptap-release.apk`，同目录报告记录包名、版本和 APK/SDK 摘要，不含密钥。缺配置、签名失败、lint 失败、包名不符或 SDK 校验不符均中止；不会以 debug 签名冒充 release。Android Studio 也可打开此工程，`preBuild` 会从本游戏源码重新准备资源，无需构建整个 Shell。

## 配置字段

| 字段 | 内容 |
| --- | --- |
| `WULONG_APPLICATION_ID` | 在 TapTap 后台登记的稳定包名；以后更新不可随意改名 |
| `WULONG_VERSION_CODE` / `WULONG_VERSION_NAME` | 正整数版本号 / `2.0.0` 形式的版本名；每次正式更新提升 code |
| `TAPAD_MEDIA_ID` / `TAPAD_MEDIA_KEY` | Dirichlet/TapADN 后台真实媒体 ID 与客户端媒体 key；不是 TapSDK 登录 Client Token |
| `TAPAD_HINT_SPACE_ID` | 与该媒体/包名对应的竖屏激励广告位数字 ID |
| `WULONG_PRIVACY_URL` | 本游戏实际公开的 HTTPS 隐私政策，包含实际 SDK 及数据处理说明 |
| `ANDROID_KEYSTORE_PATH` | 正式签名 keystore 的绝对路径，或相对 `android/` 的路径 |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | keystore 密码、alias、私钥密码 |

## 广告与生命周期

- 只有提示页点击「看广告 · 机关高亮 30 秒」才请求广告。三级文字提示一直免费；无可交互机关、分享挑战及未解锁开发试玩不展示广告入口。
- `wulong-city:hint-highlight` 映射到上述广告位。加载成功并缓存后展示；只在 `onRewardVerify(..., true, ...)` 和关闭均发生后返回 `completed`，仅播放结束/点击关闭不会发奖。取消、重复回调、换关后的迟到回调均隔离。
- 30 秒仅消耗前台游玩时间；广告、暂停和后台不扣时。重试清空，奖励不改变主线解锁/收藏，也不写永久存档。每次广告请求间隔至少 60 秒，一次进程会话最多 6 次。
- 首次请求前显示原生说明并征求同意；拒绝仍可继续解谜。设置页「广告与隐私」可以查看政策或撤回并退出。所有 11 个可选采集开关默认关闭、个性化广告关闭；不申请运行时敏感权限。合并清单保留网络与 SDK 下载通知声明，通知权限由系统控制，宿主不请求授权。最终控制效果须在真实广告配置和设备上验收。
- Android 全屏和竖屏由 Activity 管理，隐藏浏览器全屏按钮。系统返回键进入暂停/返回游戏页面；后台回来保持暂停。SDK WebView 与离线游戏 WebView 分离，游戏桥接页面禁止远程导航、外部资源、子框架和文件访问。

## 验证边界

`build:android` / `build:android:release` 显式执行 Gradle 编译、lint、Java 单元测试、apksigner 和包名检查。仓库普通增量门禁执行本游戏 Node 规则和生产浏览器测试，不自动安装 Android SDK 或执行 Gradle；`MINIGAME_RELEASE_GATES` 管理的是小游戏渠道，不能替代这里的 APK 打包命令。

浏览器专项：`pnpm --filter @coffeeeeffoc/wulong-city test:rewarded:browser`。截图与结果在 `docs/design/rewarded-android-2026-10-14/actual/`，使用模拟 SDK 回调，不能视为真实广告收入/填充或真机证明。

安装包专项：启动独立 Android 模拟器后运行 `pnpm --filter @coffeeeeffoc/wulong-city test:android:device`，默认 `emulator-5554`，可用 `WULONG_ANDROID_SERIAL` 指定。测试会安装上述 debug APK 并清空该调试包的存档，拒绝在物理设备上自动运行；首次系统全屏教学需要先点「Got it」。通过实际 WebView 触屏验证通关、免费提示、原生返回/后台和进程重启存档，结果保存在 `android-actual/`。

TapTap 上架前还需由对应开发者账号提供真实媒体与签名、后台开通/创建广告位、检查包名与签名一致，并完成账号要求的资质/隐私说明及真机审核。这里不代替 TapSDK 登录、实名、防沉迷等按发行要求接入的服务，也不宣称已提交审核。

## 依据与版本

- [TapADN Android 文档](https://ssp.dirichlet.cn/docs/dirichlet-sdk/sdk-guide/) / [官方下载](https://ssp.dirichlet.cn/docs/resource-download/) / [使用说明](https://ssp.dirichlet.cn/docs/compliance/)，2026-10-14 核对。
- 实际 5.3.0.4 AAR 的 `RewardAdInteractionListener` 每个方法首参为 `TapRewardVideoAd`，`withSpaceId` 接收 `long`，`withRewardAmount` 接收 `int`。官网部分示例仍为旧签名；本实现按实际 AAR 编译验证。
- AAR SHA256：`5aec884e2c546aa2f3edf9d5809c2862a006fd1cc0e65e9c9b74ee492a34bb41`；与官方下载页 MD5 `B423C723F58CAB2FCAF23CA9510E8943` 一致。
