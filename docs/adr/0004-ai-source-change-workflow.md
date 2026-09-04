# AI 源码变更必须经过隔离工作区和人工审查

AI Source Extension 在独立 Git worktree 中生成，以 diff 形式供操作者编辑和确认，通过格式、静态检查、测试及构建后才能形成不可变 Game Artifact。Workspace Agent 可以创建提交，但不能自动 push、合并或绕过验证，以换取可审计性和对主工作区的保护。
