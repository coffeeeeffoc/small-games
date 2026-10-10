# 国内渠道发布与配置

截至 2026-10-11，仓库已存在六套原生运行适配。下面的“已实现”表示仓库代码与离线契约覆盖，不等于每款游戏具备原生入口、官方工具验证、广告开通或审核通过。纯 DOM/H5 游戏不能通过填写 AppID 自动变成原生小游戏；新增原生入口需要共享规则与 Canvas/WebGL 渲染，以及平台工程单独验收。

| 渠道                      | 原生宿主与工程                       | 真实激励广告                   | Competition 服务端登录    | 后续必需项                                                |
| ------------------------- | ------------------------------------ | ------------------------------ | ------------------------- | --------------------------------------------------------- |
| 微信                      | 已实现 `wx`                          | 已实现，缺广告位返回不可用     | 已实现换码                | 单款 AppID、广告位、服务端 secret、域名白名单、工具及真机 |
| 抖音                      | 已实现 `tt`                          | 已实现，单例销毁与完整观看校验 | 已实现小游戏 code2Session | 同上；真实账号登录、分享/侧边栏审核要求需真机核验         |
| B站                       | 已实现 `bl`，入口上报/侧边栏         | 已实现，缺广告位返回不可用     | 已实现换码                | 同上；桌面/侧边栏入口及广告真机                           |
| 快手                      | 已实现最小 `ks` 端口/工程模板        | 未实现，配置广告位会失败       | 未实现，明确不可用        | 官方工程字段、登录/广告协议核验、AppID与真机              |
| 支付宝                    | 已实现 `my`，存储/资源/键盘语义      | 未实现，配置广告位会失败       | 未实现，明确不可用        | AppID、官方工具/客户端、授权码协议核验                    |
| TapTap                    | 已实现 `tap`，官方打包有独立验证流程 | 未实现，配置广告位会失败       | 已实现 MiniApp code 换码  | MiniApp ID、小游戏密钥、官方打包与真机，不是普通 ZIP      |
| QQ / 百度                 | 未实现，`unsupported`                | 未实现                         | 未实现                    | 先增加已核验渠道宿主、工程及契约测试                      |
| OPPO / vivo / 华为 / 小米 | 未实现，`unsupported`                | 未实现                         | 未实现                    | 先选择各渠道当前快游戏/小游戏形态，再实现宿主、构建与验证 |

原生分享沿用各游戏已有入口、SDK 分享菜单和 Competition 邀请。调用分享 API 只表示请求打开菜单，不代表分享送达，不凭点击发奖；某游戏/渠道没有分享能力时展示手动房间码，不伪造成功。各适配包 README 记录具体官方接口来源及未验证项。H5 的浏览器分享、同题挑战与明确标记的模拟广告见 [H5 接入](h5/README.md)。

## 公开参数与生成脚本

复制 `platforms/.env.example` 到本地私有配置（建议仓库外），把 `GAME` 改为现有 builder 的 game key（大写、连字符转下划线）。AppID 与广告位可进入客户端；AppSecret、平台私钥及 `COMPETITION_PLATFORM_CONFIG` 只能写在服务端环境变量，不能放进此文件或 Vite `VITE_*` 变量。

`publication-config.mjs` 复用六个现有平台 build descriptor 校验格式，将公开变量转成既有单款 builder 的配置结构：

```sh
# 输出公开参数 JSON；配置缺失允许预览。输出目录需先存在。
node --env-file=/absolute/path/platform.env platforms/publication-config.mjs \
  --game three-choose-two --platform wechat > /tmp/game-release.json
# release 要求真实非占位 AppID，且拒绝未实现的渠道/广告能力。
node --env-file=/absolute/path/platform.env platforms/publication-config.mjs \
  --game three-choose-two --platform wechat --release > /tmp/game-release.json
pnpm minigame:build --game three-choose-two --platform wechat --config /tmp/game-release.json
# 完整渠道能力矩阵，可供发布流水线读取；不是游戏兼容矩阵。
node platforms/publication-config.mjs --matrix
node --test platforms/tests/publication-config.test.mjs
```

构建命令支持哪些 game key 以 `apps/shell-minigame/scripts/games.mjs` 为准；配置生成成功只代表参数合法，未登记游戏的构建仍须失败。九款批次继续直接使用 `MINIGAME_<GAME>_<PLATFORM>_APP_ID`、`MINIGAME_COMPETITION_API_URL` 及其专用构建器，TapTap/Cocos 仍走各自官方工具准备流程，不能拿普通包替代官方产物。仅预览必须明确 `--preview`，正式参数门槛不能被配置脚本绕过。

QQ/百度及手机厂商仅预留公开 AppID 命名，不调用猜测的 SDK，也不创建空成功工程。`--platform qq` 等会明确报 unsupported。真实广告关闭、取消、异常、无库存与超时都不得发奖或阻塞后续玩法。

通用 `ad-runtime` 同时修复不同奖励位重叠播放、SDK 不回调导致永久挂起、遥测卡死阻断奖励；SDK 回调 adapter 支持超时及监听 teardown，迟到完成不会重复发奖。它不为未实现渠道制造广告库存。

前端 dev/main CI 继续发布静态内容，真实联机/云存档需独立部署 Runtime 服务。服务端变量与一键打包沿用本仓库部署文档；平台配置、秘密配置、H5 广告模式互不混用。此轮未上传任何渠道后台，也未完成官方工具、真实广告库存或实体设备验证。
