# 共享玩家身份与正式 H5 交付记录

2026-10-16。实际仓库为 `F:\playground\playground-ai\small-games`，交付分支为 `dev`。以下分别记录正式 H5、服务端、HTTPS、官网素材及后管工具的准确来源，不把后续文档提交视为重新构建或重新部署。

## 正式 H5：12/12

候选 `47687063bd522437962026b52ee6d784dfecd099`，象五子棋子仓库 `2238989bb5fa9beeaab591b6fa5717cf08fab6c7`。12 个包均为正式 H5 构建，未使用 `--local` 或 `--with-service`；联网包显式使用 `https://api.nenggongzhiren.cn/small-games/v1`，离线包不请求服务。

实际 Chrome `155.0.8059.82` 在手机触屏模拟环境中于 11:34:07–11:41:06 UTC 完成全部组合。三款游戏的广告开/关 × 服务开/关均通过；六个离线组合没有 API 请求。广告关闭时原奖励操作直接执行；广告开启但缺真实宿主 SDK 时拒绝发奖，没有伪造广告完成。

六个联网组合使用 12 个独立玩家身份，真实触屏行动共 195 次，均自然结算；验证昵称保存、刷新恢复、跨游戏身份复用、资料过期表单、双方房间、排行榜和重复结算。随后仅对本次 12 个身份执行 PostgreSQL 只读核对：六个 rated match 持久化，结果/榜单分数一致，每场每人重复提交后仍只有一条结果。此前本地四组合矩阵及 Runtime/PG 同卷重启证明见 [本地浏览器记录](local-h5-browser.json)；本次正式公网测试没有重启生产数据库。

[完整浏览器报告原件](qa/final-20261016/h5-report.json.txt)、[PostgreSQL 只读回执](qa/final-20261016/h5-postgres.json)、[包内文件及 SHA256](qa/final-20261016/h5-delivery.json)、[Library 元数据](qa/final-20261016/h5-library.json) 已保存。原始报告 SHA256 为 `584aa5e5301011638126187f14dbfa25e189b18a90f535ba1cf65dbf4090f06e`。回执的 `.json.txt` 保留原始字节，旁边的 `.json` 仅统一排版，两者解析数据一致。完整脱敏 API 轨迹保存在各分组 ZIP 的证据中；Git 中保留报告、精选实际截图及其 [哈希目录](qa/final-20261016/inventory.json)。

每个附件均内含广告开、关两个独立正式 ZIP，以及清单、验收记录和哈希：

| 游戏     | 服务 | Library file ID                            | 分组 ZIP SHA256                                                    |
| -------- | ---- | ------------------------------------------ | ------------------------------------------------------------------ |
| 围捕小队 | 离线 | `libfile_ddd8b11730cc81919fb191adfbe0a4c7` | `23ca16d4ad8ad6b34d7a39bee0a775eb7b97e7099eed6bdc41bbe8ff07227363` |
| 围捕小队 | 联网 | `libfile_8b225eb0065c8191afc57e0acca01926` | `3633dc8c34622be296298088116d9bb58ffd7c9e01c070f321217016e17d3a4f` |
| 街区追捕 | 离线 | `libfile_8267a51fcd4881918c4c43bdd13b468e` | `a8d244d6659b3dcee63e1ea84af07c767262b19fb74acad4ecbb6fce1924db83` |
| 街区追捕 | 联网 | `libfile_ba9381ffc9a481918ce01abfae50679e` | `8332c09e27ec6ac2bc14ad21f7f003b1973d2fa64cc95c0665272f946c2f8e7c` |
| 象五子棋 | 离线 | `libfile_08fb636505ac8191b8591499e587c3ef` | `3ace7a23c3699cf1d1b25f2d931af093821701de51f8492db54eea95a74b546f` |
| 象五子棋 | 联网 | `libfile_8793357c01f48191ae8a36a6929b2ef1` | `0c0ddb1b2170643f53733013a78cf2449e16a076527420f2b1fb7fcf851240bd` |

6/6 上传成功，版本均为 0，字节和摘要相符；没有保存签名下载 URL。当前原生 Windows 不支持所请求的 `user.library-file-version` xattr，已在元数据记录 `unsupported`，没有改权限或改写 ZIP。

该候选正常 pre-push 通过，[CI 38894505292](https://github.com/coffeeeeffoc/small-games/actions/runs/38894505292) 与 [Pages 38894505356](https://github.com/coffeeeeffoc/small-games/actions/runs/38894505356) 均以同一完整 SHA 成功。[dev Pages](https://coffeeeeffoc.github.io/small-games/dev/) 为对应前端入口；该状态不代表原生平台发布。

## 已完成的生产发布

Runtime 来源 `da201f8371a39a51553db7a25216c5f6d87ac739`，发布目录 `identity-20261016t085143850z-da201f83`。在现有 `small_games`、`platform_owner` 和 `small-games_postgres-data` 卷上追加 013；完整私有备份、同版本隔离恢复、重复迁移、旧行/schema/owner/ACL/角色保护通过。Runtime 镜像为 `sha256:aef467b3bea0afaa8d683536c9c72b3dd1e4243247f12e718200647d446dab76`；PG 镜像仍为 `sha256:d741b376874687de90374fd34f55c6b2760e8f7bd7e4ae5cd47f50757fc08cf8`。私有备份 SHA256 为 `f5e991e452c2a90804455ed1d97c7fb506641e2572316ac76a081a1dde2a109a`，备份未上传。见 [Runtime 回执](qa/final-20261016/runtime-production.json)。

HTTPS 来源 `a64bb7429755a7307a007f730caa37e0ea8c4e78`，发布 `20261016095209-a64bb7429755-5ae871`。实际默认 TLS 校验通过；正式 `/small-games/v1` 与兼容 `/api/competition/v1` 均无重定向，元数据、排行榜、鉴权、精确 CORS、拒绝路径和双前缀共用真实来源限流通过。230 次伪造头请求仍共用同一限流桶，130 次 401、100 次 429；代理日志没有 callback query。CORS 仅允许 `http://localhost:8080`，平台实际 Origin 未擅自填写。见 [真实 HTTPS 回执](qa/final-20261016/https-public.json) 和 [先前失败与修复记录](https-empty-body-fix.md)。

官网 Logo 发布来源同为 `da201f83`，发布 `20261016090157-da201f8371a3-ef5a05`。只上线已认可 PNG 和 favicon，390/1440 实际 Chrome、默认 TLS、MIME、字节摘要、304 与无溢出检查通过；该独立发布阶段的受保护服务/指针未变。见 [官网回执](qa/final-20261016/company-public.json)。素材 Library：栅格 ZIP `libfile_5c644fefe774819184f9e566a1040b40`、无字 1024 `libfile_ae92a89a7c7c8191976424b13d739b84`、有字 1024 `libfile_8bf7f497fef48191a15a53921a6b04ce`、矢量 ZIP `libfile_96c9ea70bc6c8191a00b8ab355737e46`、渐变 SVG `libfile_d6de86e1afc48191bf1bd47a95a707ce`、单色 SVG `libfile_c4093ca3e4188191a82be89fc4c6f440`。

## 后管部署工具

`pnpm deploy:admin` 提供用户自行配置后的完整激活入口；`--provision-only` 和 `--rollback` 在读取 OAuth 文件前分支。固定同源 `https://admin.nenggongzhiren.cn`、唯一 callback `/api/auth/github/callback`、已验证邮箱 `1521152077@qq.com`、admin-only 能力及 host-only Secure/HttpOnly/SameSite=Lax Cookie。真实 OAuth 不进入 Git、构建、argv 或日志。具体步骤见 [后管部署说明](../../admin-console/deployment.md)。

本地最终有限套件 152/152，fail 0、skip 0、exit 0；格式通过。真实缓存 PG 17.6 演练覆盖完整恢复及成员 grantor、nextval 后序列、角色/schema 原子失败回滚、幂等、已有认证行保留、CONNECT grant option 拒绝且不自动修 ACL、42501 权限负例。Compose 5.5.0 同时验证 raw 配置序列化与隔离进程中的精确环境值；所有临时容器已按自有 ID/标签清理。见 [本地工具验收](qa/final-20261016/admin-local.json)。

生产 `--provision-only` 已于 13:10:36 UTC 成功退出，来源 `a20343772ac8efecd9073c8040bfb388855571e4`，发布 `a20343772ac8-1792156217273-a5e4ab`。真实候选验证覆盖 `6e9c1f7246090c7009e9519a8cda6e8efab956d5 → a2034377`；完整 SHA/count 及源文件摘要见 [部署清单](qa/final-20261016/admin-deployment-manifest.json)。最小 `management_app` 和 001 已创建，备份保留；完整隔离恢复、旧数据不变和最小权限均为 true。备份 SHA256 为 `7f55d4442a4f8241d274e4984d71dd91a49a05b4eec43601b64842a4f17eab5b`，旧状态 SHA256 为 `41791f406789873ad2f73364fce069cdf39a6ec04ba9e601b0961f9bc6b1692d`。见 [生产回执](qa/final-20261016/admin-production.json) 和 [命令时间记录](qa/final-20261016/admin-production-command.json)。

同一候选的 [CI 38903102849](https://github.com/coffeeeeffoc/small-games/actions/runs/38903102849)、[Pages 38903103066](https://github.com/coffeeeeffoc/small-games/actions/runs/38903103066)、[Cocos 38903103000](https://github.com/coffeeeeffoc/small-games/actions/runs/38903103000) 全部成功。首次 push 遇 Windows 子进程启动异常并被 hook 拦下；35 项管理测试在相同 SHA 复测通过后，重新正常 push 成功，没有改断言或绕过 hook。见 [恢复记录](qa/final-20261016/admin-push-recovery.json) 与 [最终审计索引](qa/final-20261016/admin-final-acceptance.json)。

迁移后再次只读确认角色/schema 已存在，两个 API 前缀下三游戏的元数据及 versus 榜共 12 个请求均 200、无重定向且 CORS 未扩大；后管页面 200，管理服务尚未激活，匿名 API 按预期仍为 503。见 [迁移后接口记录](qa/final-20261016/admin-production-postflight.json)。真实 Client ID/secret 仍由用户本人填写 ignored 的 `.env.admin.local`，再自行执行 `pnpm deploy:admin`；助手未读取真实 OAuth，真实 GitHub 授权、刷新、退出和撤权尚待用户完成。

## 实际验收边界

这是桌面 Chrome 的手机触屏模拟验收，未声称真机或微信/抖音/B站/TapTap 原生宿主通过。真实广告播放及完成/取消/失败/超时宿主回调尚待平台 SDK；完成前不得发奖励。单元契约覆盖取消/失败不发奖，正式 H5 实测覆盖广告关闭直接执行与广告开启缺宿主拒绝。

本轮公网成功路径未触发动态街区阻路 422 或终局 409 恢复分支，不能把相关单元覆盖称为公网负例实测。未开放新端口、扩展 CORS 到未知来源、覆盖既有数据库或合并 main。
