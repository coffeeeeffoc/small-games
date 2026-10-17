# 后端部署恢复与日常更新

## 故障原因

2026-10-17 的候选 `0d7bfdfe4087-1792248271760-eb122d` 在停止 Runtime、Kart、Management 后调用数据库 helper。SSH 部署账号有效 UID 为 1000，helper 第一条检查却要求 root，迁移尚未执行就返回 `CONTROL_OWNER_REQUIRED`。协调器缺少完整的未提交证明，将 journal 保留为 `database-unknown`，三服务和游戏代理未恢复。

现场只读检查确认：数据库仍有旧 `admin_console`，没有 `game_control`；失败候选私有目录只有 journal，没有备份、precommit 或新镜像激活记录。官网和 PostgreSQL 仍在运行。管理静态首页返回 200，但管理会话和游戏健康接口返回 502，因此首页可打开不代表部署成功。

## 本次修复

- 恢复过程统一转换旧命令模块的异常类型，冷启动健康检查在 45 秒内重试。Management 的新 Compose 保留部署前的内网 IPv4，避免维护时抢占已停止 Nginx 的可信代理地址。历史故障中已发生的地址冲突按原 journal 核对容器、网络和别名后一次性复原。
- Docker 未配置 tmpfs 时允许 inspect 省略该可选字段；隔离恢复容器仍严格验证实际 tmpfs、内存、CPU、网络和归属。云端实测缺字段的现有容器及带 tmpfs 的临时 PostgreSQL 均通过，临时容器已清理。
- 隔离 PostgreSQL 等待最终 TCP 服务就绪，再执行恢复；初始化临时进程开放 Unix socket 不算就绪，避免首条恢复命令碰到数据库重启窗口。
- 代理发布验收与当前接口契约一致：游戏定义和排行榜匿名访问必须为 401；后管 HTML 按真实构建模板和响应 CSP 校验动态 nonce，不能再按旧静态 HTML 逐字比较。
- SSH、协调器、数据库 helper 使用同一部署账号，私有目录 0700、文件 0600；维护前检查身份、迁移文件和环境，停止写入者后再次核对。
- 对这个已证明在 SQL 前失败的历史候选提供专用恢复入口；验证候选、helper 摘要、原 journal、受保护指针、数据库状态后恢复原服务。恢复中断可以重试，不凭 schema 缺失单独推断安全。
- 002 控制中心迁移和 014 玩家会话迁移各自保存备份、隔离恢复结果及持久化证明。014 在同一事务内检查迁移前后状态、锁定写入、迁移并提交；提交响应丢失可根据实际数据库状态继续恢复。
- 完成标记必须同时匹配实际数据库结构与权限；正常新增玩家和修改昵称不会被误判为数据库漂移。应用回退必须满足当前鉴权能力要求。
- 三款游戏首次联网自动创建独立匿名身份，自动续期；随机昵称、内置头像可修改。没有注册、密码或登录页面。当前入口清除存储或换浏览器后会产生新身份，不提供跨平台找回。
- 访问凭证有效期 15 分钟，刷新凭证滚动有效期 180 天。后端校验服务端绑定的游戏、玩家、房间和操作权限；跨域来源不是身份凭证。

## 首次恢复

在已经提交、正常推送并通过对应检查的干净 dev 候选执行。所有命令复用服务器已有私有配置，不在命令中输入 OAuth 或数据库密钥。

```powershell
pnpm deploy:admin --recover-control=0d7bfdfe4087-1792248271760-eb122d --root-precondition
pnpm deploy:admin --prepare-control
# 使用上一条输出的实际 bundle 名称
pnpm deploy:admin --adopt-control=<bundle>
pnpm deploy:caddy --proxy-only
pnpm deploy:backend --services runtime,kart --check
```

`--root-precondition` 仅用于上述已绑定的历史故障，不是通用跳过检查。新迁移未知结果必须使用对应候选的 `--recover-control=<bundle>`，不要手动删 journal、改指针或重新执行旧安装器。014 清除旧的无游戏范围会话；玩家资料和成绩保留，客户端自动建立新凭证。

## 以后怎么更新

在干净的部署工作区根目录执行，先提交并正常推送 dev，再部署本次改动的服务。部署入口检查干净 HEAD 与实时远端 dev 一致。本次使用 `F:\playground\playground-ai\backend-login-recovery`；原工作区仍有并行开发内容，不要通过 reset/clean 强行清理它。

```powershell
git fetch origin dev
# 如果远端已有新提交，正常合并并重新验证候选
git push origin HEAD:dev

# 游戏后端和对战服务
pnpm deploy:backend --services runtime,kart
# 只改 Runtime 时也可使用 --services runtime

# 后管页面和管理 API
pnpm deploy:admin --reuse-remote-config

# 部署后检查
pnpm deploy:backend --services runtime,kart --check
```

日常应用更新不重复数据库迁移。只有域名、路由、代理规则变化时运行 `pnpm deploy:caddy --proxy-only`。游戏来源白名单、游戏开关、角色与菜单权限从后管发布并留历史记录，正常配置更新无需重启。

应用回退：

```powershell
# release 是要撤销的那次更新回执编号，不是旧版本编号；services 与该次更新一致
pnpm deploy:backend --services runtime,kart --rollback=<release>
pnpm deploy:admin --rollback
```

回退只切换兼容应用，不撤销 SQL。首次采用前的旧镜像若不满足当前鉴权能力，不能作为日常回退目标；先保留一个已验证的新基线。部署失败时保存命令输出及回执，按其阶段恢复，不删除保护记录来强行重试。

## 验证记录

2026-10-18 已完成真实云端恢复、部署和回退演练。当前后端与后管应用源码为 `bfea2c77ed7f14fc9eb31535d26fd0cc0acde802`；[CI 39072086768](https://github.com/coffeeeeffoc/small-games/actions/runs/39072086768) 和 [Pages 39072086792](https://github.com/coffeeeeffoc/small-games/actions/runs/39072086792) 均成功。后续仅前端素材修复及文档提交，不表示云端应用重新构建过。

| 项目                 | 实际结果                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 历史失败候选         | `0d7bfdfe4087-1792248271760-eb122d` 已恢复，并重复执行验证可重试                                                                      |
| 控制中心与身份迁移   | `5f31c5df94e8-1792271769909-d094a4` 的 002、014 已完成，使用修复后的恢复命令继续并重新开放原 Nginx                                    |
| 游戏后端现役 release | `bfea2c77ed7f-1792273503270-8a2019`，Runtime/Kart 健康，部署检查通过                                                                  |
| 后管现役 release     | `bfea2c77ed7f-1792273542776-ce7b23`，内部健康与公网探针通过                                                                           |
| 日常回退             | Runtime/Kart 的 `389e94f1bb73-1792272746484-9b9892` 和后管的 `389e94f1bb73-1792272885080-2c7c37` 均真实更新后回退成功，再发布当前版本 |
| 代理入口             | Caddy proxy-only 发布完成；游戏 API、后管 API 分离，后管每个文档的 nonce 与 CSP 一致                                                  |
| 公网 API 边界        | 23 项通过：精确 Origin、非白名单/协议/端口拒绝、匿名拒绝、跨游戏与房间越权拒绝、头像校验、刷新轮换、注销会话族                        |
| 三游戏公网对战       | 真实 API，两个独立 Chromium 手机触屏上下文，分别完成对局、结算和排行榜；重复动作不重复记分                                            |
| 玩家资料与广告缺省   | 随机身份、修改昵称/头像、刷新复用、入口独立身份通过；无广告位时提示等能力正常可用                                                     |

公网后管登录页与 403 页另经 Chromium 实际打开、文本和资源校验并检查截图，均无页面脚本错误；截图在 `outputs/admin-public-2026-10-18/`。这不等于完成 OAuth 登录。

可提交的脱敏汇总见 [云端恢复验收 JSON](../admin-console/qa/cloud-recovery-2026-10-18.json)。

正式 [Pages dev](https://coffeeeeffoc.github.io/small-games/dev/) 已确认发布 `ba88e46a0f7f7fb5c37c28a20c8eae7a0319eece`；[CI 39074139487](https://github.com/coffeeeeffoc/small-games/actions/runs/39074139487)、[Pages 39074139519](https://github.com/coffeeeeffoc/small-games/actions/runs/39074139519) 和 Cocos 检查均成功。正式网址的三游戏嵌入/手机触屏玩法、返回、网络响应与 Runtime 隔离复查通过。该提交删除共享头像模块导入时的多余图片预加载，修复围捕小队错误请求街区素材的 404；新增回归断言先复现失败，修改后五款共享界面的桌面/触屏检查通过。

双人对局证据：围捕小队 `6416C4CF7BC3`，街区围捕 `8028FE644F5B`，象棋五子棋 `C5F70C33535D`。本地完整报告和截图位于 `outputs/h5-taptap/online-bfea2c77/browser/057c7fc5-692c-4c38-a0d3-a6ac05d6e8fb/`，报告记录 `realDeviceVerified=false`、`realAdsVerified=false`。浏览器 H5 包使用 `http://localhost:8080` Origin，后端请求全部到真实公网 API；正式 Pages 另行验证，不混为同一入口。

测试清理回执 `.scratch/qa-cleanup-receipt.json`：仅删除本轮捕获的 26 个身份、7 个房间、30 条动作、3 条对战计分、7 条最佳成绩和 7 条结果，以及关联会话/票据；事务检查所有参与者归属，其他数据保留。最终 Pages 复测新增的 2 个身份及 2 条单局准入票据也已清理（`.scratch/qa-pages-cleanup-receipt.json`），两轮合计 28 个身份。验收房间已清理，报告中的编号用于对应证据，不再是可加入的线上房间。

仍需用户完成一次真实 GitHub 登录：当前后管 `ADMIN_CONTROL_ENABLED=true`，配置白名单包含 `1521152077@qq.com`；数据库成员尚未首次绑定、配置版本为 0，游戏使用已部署的环境策略。登录 [后管](https://admin.nenggongzhiren.cn) 后，首次管理员绑定会由正常 OAuth 流程完成，再在后台发布首个来源/游戏配置版本。浏览器连接工具报 `Debugger unattached`，因此本轮只验证了 OAuth 起始 302、匿名管理 API 401 与 403 页面，未冒充完成登录、后台角色操作或首次配置发布。后续可在后台更改开关、发布并回退，检查实际 API 和版本观察；本地真实数据库的权限、发布、锁竞争和回退测试已经通过。

本地补充证据：真实 PostgreSQL 恢复演练 28 项（含 14 类结构/权限变异、提交响应丢失和重试）、Linux 协调器 27 项、数据库 helper 契约 14 项、Caddy 入口契约 12 项通过；`92c271851ae95089bfabacacfd6f37df689ae841` 的独立 PostgreSQL/H5 验收包含 12 种组合、6 场双人对局、2 场自然单人流程、重启和幂等性，fixture 已清理。原生平台真机和真实广告回调仍待平台验收。

参考：[管理部署详细说明](../admin-console/deployment.md)、[准确候选发布规则](incremental-publication.md)。
