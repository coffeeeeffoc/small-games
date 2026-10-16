# 当前三款 Tap H5 验收

本目录描述当前工具契约。工具源码完成及单元通过不代表真实 PG、浏览器、宿主或广告已经验收。

先正常提交工具与游戏改动，冻结主仓库和象五子棋子模块的干净 SHA。实际构建不使用 `allowDirty`。每次创建独立输出目录，保留旧输出。

```powershell
$env:COMPETITION_PUBLIC_API_URL='http://127.0.0.1:43802/api/competition/v1'
node scripts/h5-taptap.mjs --profile qa-matrix --local --output outputs/h5-taptap/<candidate>-qa-<unique>
node scripts/h5-taptap-runtime.mjs --matrix outputs/h5-taptap/<candidate>-qa-<unique>/matrix.json
```

QA profile 严格为围捕小队、街区追捕、象五子棋的广告开/关 × 服务开/关十二组合。新编排器只使用新 UUID、独立标签/网络/卷、回环端口和缓存 PostgreSQL 17.6；内存 256MiB、1CPU。Runtime 使用独立应用角色，迁移由 fixture owner 原样执行并记录摘要。没有读取旧环境凭据或复用历史 fixture 的入口。控制管理 HTTP 使用真实 PG/store/routes/session/CSRF，仅官方 GitHub 身份响应是明确测试注入，不是生产登录旁路。

wrapper 在创建 PG 前按现有 `selectedBackendBuildCommands(['runtime','management'])` 串行构建必要依赖及服务，并在每步前后保持干净候选。每个构建自有子进程最多五分钟，固定 512MiB/UV1，不安装依赖。记录随后实际加载的 dist 摘要，避免旧产物贴当前 SHA。Runtime 子进程必须确认成功绑定，再经本 fixture 随机凭据只读核验，才可开始 HTTP 写入；旧端口健康响应不算归属证明。

真实浏览器串行驱动组合，六组联网比赛各使用两个独立 contexts，通过 UI 与触摸自然完成。所有十二个联网原页面和两组街区普通 solo 原页面保留到同一 Runtime/PG 重启完成；不导航到空白页、不搬运凭据。临时身份在同一文档内稳定，刷新或跨游戏导航创建新身份。Street 使用已有首关 guards/hunter 触摸策略，不使用辅助奖励或 dev；自然完成后由 UI 提交带票据的原始记录。重启前后均重放原 accepted 动作/solo 提交，并在同一 PG 对指定比赛、成绩、最佳记录和 admission 绑定比较排除时间字段的计数/摘要。不注入成绩。浏览器阶段总截止三十分钟，关闭失败仍继续清理其他自有资源并保存失败证据。

访客请求按真实 20/minute 门禁保守调度。编译子进程固定 512MiB/UV1，不继承任意 `NODE_OPTIONS`。只启动一个浏览器。资源关闭和删除仅针对本次实际持有的子进程及匹配 UUID/标签/挂载的资源。

证据位于新输出目录下的 `browser/<uuid>/` 与 `owned-runtime/<uuid>.json`。trace 只投影固定字段，URL 不含 userinfo/query/fragment；不写原始请求/响应体、headers、token、SQL、原始异常 message/stack、HAR 或 storageState。截图属于真实运行证据，不能称为真机验收。

最终交付单独构建，明确 `profile=online-ads`：

```powershell
$env:COMPETITION_PUBLIC_API_URL='https://api.nenggongzhiren.cn/small-games/v1'
node scripts/h5-taptap.mjs --profile online-ads --output outputs/h5-taptap/<candidate>-online-ads-<unique>
```

该 profile 只生成三款 ads-on/service-on ZIP，拒绝 local、matrix、关闭轴或自定义组合；十二组合不进入最终交付集合。缺少真实 adUnit 时只验 SDK 不可用及明确负向失败/取消不奖励，保持 `adUnitConfigured=false`、`realAdsVerified=false`；不伪造广告完成，不声称真实广告投放已通过。正式包的 API 指向线上不等于已经执行线上验收。
