# 浏览器门禁复核

2026-10-16，Windows、Node 24.21.0、Chrome 155.0.8059.82，桌面浏览器与触屏模拟；不是真机或原生平台验收。

候选 `2d811f231804039ef0bc1ce59a8e701655497e59` 的正常 pre-push 在 Cage Rescue 的 844×390 用例读取 `SmallGamesDev.isEnabled` 时失败，因此该次检查没有发布任何提交。独立运行同一个视口通过。源码复核未发现按视口跳过或删除该同步全局对象的路径，原失败根因尚未确定；不能声称重测通过等于修复根因。

测试基础设施另外存在确定的服务归属缺口：仅轮询固定端口的 HTTP 200，可能误认其他服务。现改为等待本次 child 的监听通知，启动失败或健康请求失败清理本次 child；记录文档、脚本、样式的网络加载失败，补足仅检查 HTTP 状态无法覆盖的情况。原有游戏与开发模式断言完整保留，故意中断的 API 请求不在静态资源失败范围。

实际复核：

- 390×844、320×568、844×390、1280×900 四个原有触屏流程全部通过，0 页面或静态资源错误。包含主页、选关、设置存档恢复、游玩、暂停、缩放、返回与触点取消。
- 使用本次创建的 HTTP fixture 占用动态端口，验证测试子进程以 `EADDRINUSE` 失败，未运行浏览器检查，原 fixture 继续正常响应。
- 既有四张设计 QA PNG 在复测后按原始字节恢复，未自动接受新截图。
- 两次初期复测未申请环回访问而报 `EACCES`，属于执行环境错误；已保留失败日志，并在允许本机连接的环境完成以上复核。

本地日志：`.scratch/identity-dev-push-2d811f23.log`、`.scratch/identity-cage-landscape-reproduction.log`、`.scratch/identity-cage-owned-server-four-touch-authorized.log`、`.scratch/identity-cage-ownership-probe.log`。完整正常 pre-push 与同 SHA 的 CI/Pages 仍须重新执行并确认。
