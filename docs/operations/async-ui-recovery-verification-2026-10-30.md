# 异步 UI、持久补传和绑定事务验证

日期：2026-10-30。基线 `87c29c53c19f5c07f8202a96393195124db8778c`，独立工作树验证。该基线的 [CI](https://github.com/coffeeeeffoc/small-games/actions/runs/40991941574) 和 [Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/40991941676) 已成功；本次没有把历史 `c26a1aba` 的暂停失败预设成当前仍存在的故障。

## Ashfall 动作前提

截图前后和暂停前在同一次页面求值中记录 `performance.timeOrigin/now`、screen、phase、游戏时间、等级、血量、升级选项及控件。每次等待后复核前提；升级页只通过已启用的免费原 UI 选择继续，重复或未知状态保留截图并失败，不改玩法、不固定等待或盲重试。

新增显式夹具在真实截图完成、截图 Promise 返回前触发升级，验证免费 UI 处理后可以暂停；结算页负例必须失败且保留原状态。这验证状态前提保护，不证明历史 CI 失败的唯一根因。实际记录的同页时钟为：截图前 654.7 ms playing、截图后 818.3 ms upgrade、UI 选择后 904.3 ms playing、960.6 ms paused；结算负例保持 result/lost。

Creator 3.8.8 真实构建和源码指纹校验通过，指纹 `2cff69208ed04588e5c5108bfbaa8900d7d9aae68349cada743fed5d39d6addf`。53 项规则、类型检查和六尺寸浏览器 18 项检查通过，页面异常为 0。尺寸为 844×390、390×844、568×320、932×430、1024×390、1280×720。原始证据位于工作树 `outputs/ashfall-front/combat-expansion/`；最后仅收敛控制台日志输出，语法检查通过。

## Night 使用的共享持久补传

确认标记经过结构检查后才清理大 journal，并读回确认删除生效；小确认标记保留以防旧标签页复活。恢复和保存均清理已确认日志，保存后再次检查覆盖另一标签页恰在写入前完成确认的情况。确认标记损坏、读写失败时保留未确认内容；删除抛错和静默失败可在恢复后完成清理。

共享 recorder/identity/client 63 项测试以及 gateway、H5 注入、bootstrap 5 项测试通过。新增边界覆盖标记写入抛错/静默失败、读取抛错/读回为空、删除抛错/静默失败、冷启动和旧标签页晚写；同实例恢复会更新结算状态，清理旧日志不会覆盖另一局活跃状态。网络请求等待期间收到其他标签页确认后，会停止后续上传且不降低已完成状态。首次三个新增清理用例在修复前失败，修复后通过。

Night 的 Creator 3.8.8 真实构建、类型检查和 26 项 online/mission-progress 规则通过，最终源码指纹 `6d993978243ecad02f0440aa7f22e878e758c07063ac03edb02b5086ad26a7f4`。共享代码追加修正后重新构建并复测，未沿用失配产物。实际引擎 H5 在 Chromium 中六场景通过：绑定、删除抛错、删除静默失败、换设备、另一账号、缺少 SDK。两种删除故障刷新后 journal 均回收，确认标记保留，运行请求数量不增加，finish 仅一次。SDK 和 HTTP 为显式 fixture，未发生产玩家请求。[结构化结果](../../games/local/night-overwatch/docs/recovery-2026-10-30.json)。最终截图保存在本机 `outputs/night-overwatch/recovery-20261030-final/`。

## Night 使用的身份绑定事务

复用既有真实 PostgreSQL 测试屏障，在游客资料更新、旧会话撤销、游戏访问授权、新 access session、新 refresh token 五次实际写入之后分别抛出异常。验证完整玩家资料、成绩、访问授权、旧会话与刷新凭证逐项回滚，旧凭证仍可用、无半绑定身份；移除故障后可正常绑定同一玩家，撤销旧凭证并仅保留一组新凭证。生产事务实现已有正确边界，本次只增加测试。

使用本机 PostgreSQL 17.6 的隔离 `competition_test` 库和既有 `runtime_app` 角色。Night 定向集 8 项全部通过，包含五个新故障点以及保留身份/成绩、账号冲突、并发用例；另外 8 项因范围过滤未执行。完整身份集曾运行 15 项通过、1 项失败：既有 Kart 用例直接删除 `player_game_access`，当前测试角色无 DELETE 权限。本次未扩大权限。Runtime 构建、类型检查和修改测试文件 ESLint 通过。

## 范围与未验边界

按准确候选与共享消费者规划增量范围，未把未知路径降级成全量或空范围。未运行全仓本地候选校验；提交后的 CI/Pages 应按最终 SHA 单独核对，范围规划成功不等于流水线或 Deploy 成功。本次不部署 Runtime，不合并 main，不上传 TapTap 包。没有真实 Tap 宿主新鲜 code、实体手机、真实广告或生产玩家验收。

两款游戏的八类上架资料沿用已有档案；此次没有视觉或玩法改动，保留原截图、视频及来源指纹。既有 Ashfall 宣传图规格、真实宿主和实体手机待验边界仍见各自 publishing/STATUS.md。
