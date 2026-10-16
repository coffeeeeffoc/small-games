# 配置中心前端验收

本轮基于 `6a4fae606bec60cace0978b2fd79cd862bf1665b`，实现 Ant Design 6.6.6 配置中心前端，保留原登录、无权访问与欢迎页面。未提交、推送或部署；未读取 OAuth 凭据，未连接生产数据库。

## 实现范围

| 路径       | 行为                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `/config`  | 精确公共 API Origin、完整快照草稿、明确发布、历史回退、版本冲突差异与显式重新基准化      |
| `/games`   | 11 款已登记游戏的开放、停止新局、停用状态；kill epoch 只读；Tianxia 显示独立服务尚未纳管 |
| `/members` | 成员邀请、修改、删除与理由；已绑定邮箱不可修改；缺少 `roles.read` 时不请求角色目录       |
| `/roles`   | 固定权限集合的自定义角色；内置管理员只读；被成员引用的角色删除错误可见                   |
| `/audit`   | 审计记录与安全文本详情                                                                   |

菜单和直接访问均按会话权限限制。请求使用同源 Cookie、CSRF 头和有界超时，写入不自动重试。401/403 会重新读取会话并卸载失效表单。草稿冲突保留当前输入，回退仅提供给 `publishedVersion` 非空的历史记录。

目标版本与已知应用报告分别展示；应用覆盖始终明确不完整，过期实例保持未知，不宣称服务健康或全部部署生效。

控制页面仅在 `sg-csp-nonce` 为规范的 32 字节 Base64 时启用，向 `ConfigProvider` 提供 nonce，通知由 AntD `App` 上下文产生。简单列表采用带表头 `scope`、可访问名称和横向滚动容器的原生语义表格，避免当前 rc-table 滚动条测量插入无 nonce 样式。其余控件和主题继续使用 AntD。加载按钮使用稳定的无障碍名称和 `aria-busy`。

## 最终成功证据

- [receipt.json](receipt.json)：21 个源码文件、4 个构建文件和 24 张成功截图的 SHA-256；测试时再次核对源码未变化。
- [browser-success.log](browser-success.log)：完整浏览器执行，退出码 0；原三页 × 三宽共 9 场景，以及 15 组控制检查全部通过。
- [build-final.log](build-final.log)：`tsc --noEmit && vite build`，退出码 0。依赖的 `use client` 打包提示和产物体积提示仍保留。
- [caddy-spawn-regression-final.log](caddy-spawn-regression-final.log)：异步 `EACCES` 注入回归，1 通过、0 失败、0 跳过，退出码 0；验证原错误保留且自有 API/临时目录清理。

环境为 Windows、Node 24.21.0、pnpm 12.6.0、Chrome 155.0.8059.82 和实际 Caddy 2.11.7。Caddy archive/executable 摘要保存在收据中。浏览器通过 `startAdminCaddy` 启动自有动态 loopback 站点，API 使用无秘密 fixture，未以 preview 替代实际 Caddy。

覆盖 320、390、1360 CSS 像素宽度，手机宽度使用触屏输入，并保留少动画检查。检查包括完整草稿/发布/回退、CAS 冲突、即时撤权、最后管理员错误、成员与角色 CRUD、引用保护、五组最小权限、四类非法 nonce，以及每响应 nonce。所有正常交互的 CSP 违规和页面错误均为零；最后故意插入无 nonce 样式，确认被 CSP 拦截。

成功截图为 `legacy-*` 和五页各三宽的 PNG。小屏表格保留独立横向滚动；截图反映流程执行后的滚动和焦点位置。实际查看了 `config-1360.png`、`games-320.png`、`roles-390.png`，文字与操作区可见。它们是桌面 Chrome 模拟截图，不是真机结果。

## 执行命令

使用已安装的原生 Node/pnpm，`NODE_OPTIONS=--max-old-space-size=512`，`PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`、`COREPACK_ENABLE_NETWORK=0`；构建时单线程配置保持本轮设置。浏览器明确设置 `PLAYWRIGHT_EXECUTABLE_PATH` 与 `CHROMIUM_PATH` 为 `C:\Program Files\Google\Chrome\Application\chrome.exe`。

```text
pnpm --filter @coffeeeeffoc/admin-web typecheck
pnpm --filter @coffeeeeffoc/admin-web build
node --test --test-concurrency=1 --test-name-pattern="asynchronous spawn failure" scripts/admin-caddy-fixture.test.mjs
node apps/admin-web/tests/browser.mjs
```

源码、测试及 helper 在最终构建和完整浏览器之前已按仓库 Prettier 格式化。构建、回归与浏览器串行执行，无依赖安装。浏览器的 `finally` 即使 Chrome 关闭失败也会继续清理自有 Caddy；成功轮 `browser.close()` 与 `server.close()` 均完成。结束后只读核对自有 Caddy 进程数、fixture 临时目录数均为 0。

## 保留的诊断记录

旧失败日志和 `diagnostics/` 仅用于问题定位，不计入成功样本与成功截图摘要。

- 导航/保存诊断确认 rc-table 的无 nonce 测量样式，以及加载图标造成按钮无障碍名称变化；相应实现修复后最小流程通过，见 `navigation-fixed.log`。
- `browser-complete.log` 是上一轮失败，不能作为通过凭证。
- `roles-navigation-diagnostic.log` 捕获 URL 已为 `/roles`、DOM 仍是成员列表的短暂窗口，管理员成员行有两个成员操作按钮。测试现先等待角色页标题及角色列表，再保留内置角色按钮数为 0 的断言；最小角色 CRUD 通过，见 `roles-navigation-fixed.log`。最终完整轮也已通过。

## 验收边界

本轮证明前端与明确 fixture 契约及实际本地 Caddy/CSP 交互。真实 GitHub 登录、生产 HTTPS/数据库/运行时配置应用、真机和宿主平台均未在本轮验收，收据对应标志为 false。未修改 package/lock/Vite/CSP/部署配置或后端。部署来源门禁的后续整合由主会话处理。

## 主会话整合

交接后补齐 Caddy 打包的来源门禁：构建前和打包后均检查 `scripts/admin-csp.mjs` 及其 `.d.mts`，并要求 HEAD 不变。隔离 Git fixture 证明任一文件未提交或候选 HEAD 前进均拒绝打包，1 项测试通过。此修改没有改变上述已验收的前端、CSP 模板或浏览器输入；成功收据保持原样。
