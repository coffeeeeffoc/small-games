# 代码可读性与包边界规范

## 强制门禁

CI 依次执行 format check、ESLint、TypeScript strict、循环依赖检查、单元测试、contract tests、集成测试和独立构建 smoke test。任一步失败都不能形成 Game Artifact。

单文件 300 行是软限制：超过时 ESLint 警告；只有附带局部 disable 和具体原因才能保留。生成代码必须经过 Prettier，禁止提交当前原型中大量表达式挤在一行的写法。

## 文件职责

- 一个文件表达一个主要概念。
- React 视图、状态机、领域规则与 adapters 分文件存放。
- 领域规则优先写成纯函数，由 interface 返回结果而不是直接制造副作用。
- index 文件只定义公开 exports，不承载实现。
- 公共 interface、错误和重要不变量必须写 TSDoc。
- 测试通过公开 interface 验证行为，不读取内部状态。

## Package 依赖

- 所有内部包使用 `@coffeeeeffoc/*` scope。
- 只允许通过 package `exports` 导入，禁止 `../../other-package/src`。
- Game 可以依赖 game-contract、内容 envelope 和必要 UI primitives，不能依赖具体 Shell、平台 SDK 或后端实现。
- Shell 可以依赖 loader、host adapters、ad-runtime 和 Game 的公开入口。
- Shared package 只有出现两个真实 adapters 或调用方后才建立 seam。
- 服务之间通过版本化 transport adapter 通信，不共享业务实现或直接查询对方 schema。

## 命名

目录、源文件、类型和提交信息使用英文。产品界面、游戏内容和领域文档可以使用中文。使用 CONTEXT.md 中的 canonical terms，不用“子仓库”“套壳”“广告开关”等含义不明确的替代词。
