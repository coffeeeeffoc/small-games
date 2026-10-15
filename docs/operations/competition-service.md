# 三款游戏的可选服务

围捕小队 `cops-robbers`、街区追捕 `cops-robbers-realtime`、象五子棋 `xiangqi-five` 共用以下公开配置：

| 配置                          | 含义                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `COMPETITION_SERVICE_ENABLED` | 仅接受 `0` / `1`，默认 `0`。关闭时丢弃地址，不显示好友服务入口。                                                      |
| `COMPETITION_PUBLIC_API_URL`  | 完整比赛 API 基址，如 `http://127.0.0.1:43010/api/competition/v1` 或 `https://games.example.com/api/competition/v1`。 |

`--with-service` / `--without-service` 优先于环境变量。启用但没有地址直接报错。本地 H5、Creator Web 预览和内部部署允许 loopback HTTP；正式原生包与公网部署要求 HTTPS。地址不带账号密码、查询参数或片段，客户端不注入服务端密钥。

## 本地有服务测试

在仓库根目录执行，以下为 PowerShell 示例（bash 使用 `export` 设置同名变量）：

```powershell
$env:COMPETITION_SERVICE_ENABLED='1'
$env:COMPETITION_PUBLIC_API_URL='http://127.0.0.1:43010/api/competition/v1'
pnpm competition:game --game cops-robbers --dev --with-service
```

游戏可换成 `cops-robbers-realtime` / `xiangqi-five`。命令构建所选游戏并启动静态前端，修改源码后重新执行；默认端口 43700，可通过 `PORT` 修改。去掉 `--dev` 只构建 H5。两款追捕原有的 `pnpm --filter <game> dev --with-service` 也支持配置。

后端单独沿用 `pnpm competition:up`，构建 Runtime 后执行 `pnpm competition:dev`。跨端口访问时，将前端 Origin 加入 `COMPETITION_ORIGINS`；也可使用已有比赛网关提供的同源站点。网关读取相同开关和地址。服务不可用时单机仍可继续。

象五子棋使用统一命令；子模块原有独立房间服务保持不变。统一入口关闭旧 `/api/rooms` 房间及其存档自动恢复，使用 Runtime 比赛服务。

切回离线可执行 `pnpm competition:game --game xiangqi-five --dev --without-service`。环境变量由终端或 Node `--env-file` 显式加载，不自动读取 `.env.example`。

## TapTap 无服务端包

按 [Cocos 工程说明](../../games/minigames/README.md) 准备 Creator 3.8.8、官方转换插件和真实 AppID。无服务端正式包不再要求 code2Session API：

```powershell
$env:TAPTAP_APP_ID='你的真实MiniAppID'
node games/minigames/scripts/build.mjs --game all --platform taptap --release --without-service
```

需要接服务时，设置公网 HTTPS 地址并使用 `--with-service`。Cocos 保留 `TAPTAP_API_URL` 及游戏级 `MINIGAME_<GAME>_<PLATFORM>_API_URL` 覆盖；旧 Canvas 构建保留 `MINIGAME_COMPETITION_API_URL`。所有地址都受统一开关约束。

两款追捕的 TapTap **H5** 打包脚本接受 PowerShell `-WithService` / `-WithoutService`：

```powershell
pnpm --filter cops-robbers package:taptap -WithoutService
pnpm --filter cops-robbers deploy:taptap -PackageOnly -WithoutService
pnpm --filter cops-robbers-realtime package:taptap -WithoutService
```

H5 ZIP 和原生 MiniApp ZIP 沿用各自官方上传入口。围捕一键上传可从游戏 `.env` 加载公开服务配置。

## 云部署

在 `.env.tencent.local` / `.env.deployment.local` 或终端设置：

```dotenv
COMPETITION_SERVICE_ENABLED=1
COMPETITION_PUBLIC_API_URL=https://games.example.com/api/competition/v1
```

```powershell
pnpm deployment:bundle --with-service
pnpm deploy:tencent --public --prepare --with-service
```

无服务前端使用 `--without-service`。打包 Runtime 和允许前端接入是独立选项：可部署后端但关闭三款前端入口，也可连接已有外部服务。脚本传入构建配置并更新发布副本；其余游戏沿用原有配置。开关与地址属于构建缓存输入，切换后重新构建发布才能改变静态前端。

# Three-game H5 advertising and service matrix

`H5_ADS_ENABLED=0` (default) permits the original hint/support action directly.
`H5_ADS_ENABLED=1` selects the TapTap H5 rewarded host. Only a completed
advertisement grants that action; dismissal, failure, timeout, page cancellation
and an unavailable SDK grant nothing. Public ad unit IDs use
`TAPTAP_COPS_ROBBERS_AD_UNIT_ID`, `TAPTAP_COPS_ROBBERS_REALTIME_AD_UNIT_ID`, or
`TAPTAP_XIANGQI_FIVE_AD_UNIT_ID`. These are public build configuration, never server
credentials. The explicit `--with-ads` / `--without-ads` flags override the variable.

The independent `COMPETITION_SERVICE_ENABLED=0/1` and
`COMPETITION_PUBLIC_API_URL` control backend access. Disabled packages discard old
service addresses and do not contact the API. A missing SDK never becomes a mock
completion. Free support retains the original per-run quota and assisted-score
isolation; a free chess hint still caps the challenge at one star.

From a clean committed checkout, build twelve distinct H5 ZIPs and manifests:

```powershell
$env:COMPETITION_PUBLIC_API_URL='http://127.0.0.1:43802/api/competition/v1'
node scripts/h5-taptap.mjs --matrix --local
$env:H5_MATRIX='<the printed output directory>'
node scripts/h5-taptap.browser.mjs
```

`--local` explicitly marks HTTP loopback packages as local validation artifacts;
formal service packages require HTTPS. A single package can instead use
`--game cops-robbers --without-ads --with-service`. Every ZIP has `dist/index.html`,
an exact file inventory and SHA-256, and pinned root/submodule commits. Generated
game output is cleaned before each build, and source changes require a new commit
and a new matrix. These are H5 artifacts, separate from Cocos platform packages.

The browser matrix uses two independent mobile touch contexts per online variant,
real local Runtime/PostgreSQL interactions and natural match settlement. Reports
and screenshots remain under the matrix directory; authentication fields are
redacted. A headless missing-SDK check proves refusal to reward, not real TapTap ad
playback or physical-device acceptance. Restart persistence and duplicate requests
also require the backend integration and restart evidence described below.
