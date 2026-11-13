# 夜航守望 1.1.0 正式服务发布

2026-11-14 已完成正式后管、Runtime 和精确代理路由部署。真实 GitHub 管理员已登录并发布版本登记；控制配置 v3 已被 Runtime/Kart 应用。玩家查询入口为 <https://admin.nenggongzhiren.cn/players>。完整脱敏回执见 [deployment.json](deployment.json)，正式查询截图见 [production-players.jpg](production-players.jpg)。

## 候选与执行

- 后管/控制库候选：`7a9bf1a98d8cccc85f21fbc9a09fbfeb6be53935`，发布目录 `7a9bf1a98d8c-1794598562686-5a3c77`。
- 最终 Runtime：`592c847b8167fb52fe80ed55a59c36758d1f7d2b`，版本 `1.1.0`，发布目录 `592c847b8167-1794600423233-be369e`。相对后管候选仅补全查询中的观战者、资产调整前值及回归测试，不改变游戏规则。
- 正常推送链：`ef403563 → 7a9bf1a9 → 592c847b`；保留并行更新日志改动。H5 从干净 `68ea8191` 构建，后续版本计数/查询修复不改变 H5 输入。
- 执行顺序：018 私信迁移及隔离恢复校验 → 为 Management 配置既有 Runtime 内部只读接口密钥 → `pnpm deploy:caddy --proxy-only` → `pnpm deploy:admin --adopt-control=7a9bf1a98d8c-1794598562686-5a3c77` → `pnpm deploy:backend --services=runtime --version=1.1.0` → 真实管理员 CAS 发布版本登记。

018 使用本批次已审阅的本地 `.scratch/social-migration.py` 执行，SQL/runner/模块/备份 SHA 均记录在回执中。它完成 34 张既有关系恢复比对、重复迁移、正式事务后 schema 校验及同一 payload 恢复检查；不以准备包生成代替数据库验收。控制库 v4→v5 使用正式部署协调器，备份和隔离恢复均通过。最终仅 Runtime 更新另有新备份，该次回执的 `isolatedRestoreVerified=false` 保留原值，没有声称再次恢复这份备份。

数据库容器 ID、镜像和 `small-games_postgres-data` 卷保持不变；没有结束或清除既有旧局。官网发布指针保持原值，保留清理与备份定时器。Runtime/Kart/Management/PostgreSQL/NGINX 最终全部 healthy。Schema v5 不能退回仅支持 v4 的旧应用；回退须使用兼容候选及现有带守卫的部署入口，禁止直接切回升级前镜像或覆盖上线后的数据库。

## 玩家查询

仅覆盖夜航守望。日期、昵称和 `#xxxxxxxx` 同时筛选，50 人分页；详情按业务分类分页，提供完整当前页 JSON 和复制功能。包含资产、记录、成绩、房间、好友、私聊、公聊、举报与在线观测；长业务数组/文本不静默截断，超过 4 MiB 明确报错，可减小每页条数。

时间来源是保留约 120 天的每日首次/末次访问观测，不是逐次登录流水；无历史观测显示未知，时间条件不会命中。认证凭据、平台 subject、原始仿真和动作回执不提供。查询只读，通过现有权限、CSRF、内部鉴权及前后审计；未给 Management 增加玩家数据库直读权限。

正式管理员已验证旧测试账号无观测时的身份查询、详情 JSON，以及新测试账号的日期/昵称/短 ID 三条件查询。匿名查询 401，公开入口访问内部查询 404。

## 1.1.0 包与准入

前端版本及开关分组均登记为 `1.1.0`，准确 buildId：

```text
night-e829400e2aa4c54e587c62fd6df411c02051275cb09d8aecb6f514f9b400f6de
```

H5 包位于本发布工作树 `outputs/game-builds/20261113T193357848Z-f2bad6/taptap-h5/night-overwatch-taptap-h5-production-ads-on-service-on.zip`，53,250,641 字节，SHA-256 `52c4413548934dc94e5cd162dc3757588a60d68980ba92c5d06092b25c190e9c`。生产广告和正式 API 启用，无开发模式。版本文件中的 `nextVersion=1.1.1` 仅为下一次打包计数。

新包使用 v18/v12；不带 buildId 的旧包保留 v16/v9。两组新局准入均开启，旧局执行器保留。正式 API 已实际创建/取消两组测试单人局。控制发布号 3，修订 `48f37149-b099-48bb-bc00-4ecd77ae128e`，最新消费状态 observed。

TapTap **尚未上传或切换新包**，`latestBuildId=null`，避免向旧玩家提示尚未可用的更新。浏览器看到当前线上包 ID 452389；本地 11 月 8 日生产包的规则/无 buildId 行为与之相符，但没有唯一上传回执，不能把本地归档认定为平台包的逐字节证明。

## 验证与边界

- 部署 Python 48 项、admin/CSP JavaScript 27 项、精确 ingress 10 项通过；之前的兼容守卫 47 项及相关 30 项契约通过。
- 玩家共享契约 2 项、Runtime 鉴权/真实隔离 PostgreSQL 3 项、Management 2 项；最终字段补全重跑共享和 Runtime 检查通过。
- 玩家浏览器 45 项覆盖桌面、390/320 窄屏、过滤、分页、大 JSON、复制、超限/失败/空态及权限。各服务及管理台构建通过。
- 累计夜航真实 PostgreSQL 8 文件 92 项通过；正式跨部署旧 v16 局继续/幂等/越权验证、私信隔离/已读、好友接受、私密房权限和退出通过。仅使用临时 QA 玩家，未发送公共消息，所有 QA 会话已退出。
- 上架八类材料共 43 文件大小及 SHA-256 与清单一致，媒体沿用原采集身份，没有伪称重新采集 1.1.0 真机素材。
- 独立全范围 `publication-scopes.test.mjs` 最初 136 项中 11 失败；本次引入的历史 Night fixture 漂移已固定到原审阅提交并定向通过，其余 10 项为既存历史/隔离 fixture 问题，未扩展修复。累计 Turbo 范围定向测试及真实 CI 规划通过，未重复全仓候选测试。
- [7a9 CI](https://github.com/coffeeeeffoc/small-games/actions/runs/43493733779) 的 Night Creator 534 项玩法测试有 6 项既存失败，涉及 extraction/garrison/mission-progress/priority/training；这些输入从此前候选到最终 Runtime 未变。[Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/43493733704) 因 Creator 门禁失败而未部署。最终 [592c CI](https://github.com/coffeeeeffoc/small-games/actions/runs/43498517900) 独立跟进，不能将正式服务器成功表述成 CI/Pages 成功。
- GitHub OAuth 曾在正式服务器交换 code 时发生间歇 TCP 连接超时；普通重试后成功登录，没有修改 DNS/代理或绕过认证，不宣称网络根因已消除。
- 实体设备、TapTap 宿主和真实广告未验证；未上传渠道包。生产验证不等于完整自然双人终局或长期经济验收。
