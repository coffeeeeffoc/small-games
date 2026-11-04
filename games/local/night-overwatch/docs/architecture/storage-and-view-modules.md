# 夜航守望：存储入口与视图模块

2026-11-05。上一轮IndexedDB迁移已作为检查点 `d36cf1f370468e333fa4c4c8a638fbb095c8d5dc` 推送到dev。本轮在该行为基线上拆分职责，不变更数据库名称、store、旧键、联机协议或视觉规则。

## 存储接口与后端

`night-storage.js` 是经典脚本启动桥：捕获旧localStorage的只读引用，同步发布ready屏障，再动态加载模块。`runtime.mjs` 选择后端、安装唯一实例和可选跨页通知；`store.mjs` 管理同步镜像、写队列、旧数据读取、删除墓碑与刷新合并；`indexeddb.mjs` 只负责打开数据库和真实事务。

后端协议只有 `source`、`readAll()`、`writeBatch(writes)`、`compareAndSet(key, expected, value, absent)` 和 `close()`。批次与CAS仅在提交完成后resolve，CAS的读取、比较、写入必须原子完成；key缺失时才调用absent，null是已删除墓碑。通过同一工厂注入另一内存后端的测试证明可替换，而无需改动业务调用者。

业务通过 `Storage.ts/getNightStorage()` 获取实例。Platform保留该实例，并交给Online和Quartermaster；共享服务与身份使用bootstrap显式传入的同一对象，身份WeakMap仍按实例共享。原生返回既有Cocos/渠道存储对象，保持同步存储契约。H5缺少统一实例时明确失败，不能从业务工厂直接绕过初始化写回旧库。

`window.localStorage` 仅作为Cocos初始化探测和共享dev-mode的兼容边界，指向同一新实例。旧真实localStorage不set/remove/clear；新库优先，墓碑阻止旧值重载复活。同步set仅意味着本页可见；关键开局记录、交易编号和回执必须await flush。refresh保护pending、committing及更新的revision，身份CAS只等待自身key，不被无关日志失败阻断。跨页通知只是提示，关键操作仍从后端刷新。

已加载的后端能力失败可降级为仅会话内镜像，供本地训练和偏好读取；其flush、refresh、CAS始终拒绝持久化请求。模块依赖404、语法错误等加载失败直接拒绝ready并显示启动重试，不冒充可用后端。首次开局尚未提交不能发请求；已经持久化的运行中记录发生新写失败时，保留在线权威结算能力；回执没有提交就不提前删除恢复输入。

`night-storage/manifest.mjs` 是H5复制、源码摘要和原生fresh staging的共同文件清单；Turbo同时覆盖启动桥及模块目录。测试核对清单逐字复制，并逐项修改staged模块验证摘要确实改变；新增文件仍需准确消费者登记，未知共享路径保持阻断。

## 视图职责

HUD保留通用绘制、布局、按钮集合和弹窗生命周期。`OnlineLobbyView` 持有在线输入框、聊天刷新签名、列表锚点及未读状态，轮询只更新大厅内容，不重建正在编辑的输入框。`SettingsGuideView` 承担设置与指南绘制，使用明确的HUD字段子集。共同配色位于`HudTheme`，未修改色值或几何。

`OverwatchSnapshot` 是只读采集函数，通过`Pick<Overwatch, ...>`限定实际依赖；私有呈现时间作为参数传入。原snapshot方法仅委托，返回字段、引用与克隆语义保持不变。新模块正常分行，原大文件只改动抽取职责及连接处；原Cocos meta UUID保留，新模块使用独立UUID。

以检查点对比、统一LF后计UTF-8字节：HUD从179,107降至132,294（减少26.1%），Overwatch从89,276降至80,388（减少10.0%）。这里衡量的是原主类承担的职责减少，新模块展开正常缩进后总行数不作为优化指标。

## 本轮不启用Cache Storage

当前构建的`md5Cache: true`提供内容版本化URL；Web资源缓存由浏览器负责，并不等于已有离线能力。[Cocos 3.8缓存说明](https://docs.cocos.com/creator/3.8/manual/en/asset/cache-manager.html)说明Web缓存由浏览器管理，MD5让资源变化后使用新URL。

Cache Storage需应用管理更新和删除，不会自动过期、不遵循HTTP缓存头，并受配额与清理机制影响。[MDN Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache)。当前没有新的离线资源包需求，也没有可证明的弱网恢复收益；新增另一份资源缓存会增加同源配额占用和版本管理成本。因此保留浏览器HTTP缓存及现有版本化路径，业务数据使用IndexedDB。未来有明确离线包需求或测得弱网恢复收益时，再设计资源清单、更新、清理和容量边界；Cache不能替代业务事务与身份CAS。
