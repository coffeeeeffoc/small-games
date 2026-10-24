# dev 整合与交付记录

日期：2026-10-24。用户要求将本会话的子弹花园改动推送 dev。

- 功能提交：`3d23a1ab76681badd1b929f703288873d0aa5715`。
- 已正常合并远端 `e94899634546f314c9b2be8e56fca9b276fdcd5a` 的共享广告及资料整理，随后同步远端 `ae94af7491904460d5a894fab432b8941f75e367` 的并行游戏提交。
- 实际验证代码候选：`a2d69b8a51955e685599553b583264501917ddd1`。本记录及对应报告是其后的纯文档追加；最终提交号由 Git 历史确定。
- 最终 Creator 3.8.8 web-mobile 源码指纹：`5758d9e59d661c651a26f6efcc29bc3ab7172acb5ffddafac3b4c7bea1db4aa5`。同步最后一批远端后重新计算一致，实际 dist 与此源码匹配。

## 合并处理

游戏代码自动合并；人工处理 README、上架状态和三份文案冲突。保留本次鼠标/触摸、固定镜头、角色步态、成长节奏与新首页，也保留远端共享 H5 奖励 provider、遮罩先隐藏后返回的生命周期修复。上架文案继续明确补给/续战可选，只有完整观看才发奖。

素材未因广告整合重画。已有七种视口和完整通关截图/录像来自 `f8d7e3d9...` 的真实构建，保持原始来源标记；本次新清单重新核对当前文案与实际媒体文件，不把先前录制冒充合并后的新录屏。新增的鼠标、内嵌输入和广告 fixture 报告来自上述最终构建。

## 定向检查

- `node scripts/typecheck.mjs`：通过。
- `node --test tests/*.test.mjs`：173/173 通过；[完整输出](dev/unit-tests.log)。
- `node scripts/build.mjs web-mobile`：真实 Creator 构建完成，浏览器成功加载实际产物。
- `node tests/pointer.browser.mjs`：纯鼠标、触摸设备上的鼠标、触摸后切鼠标、中心拖动、移出画布松手、失焦清理、内嵌首次鼠标/触摸点击通过；[报告](dev/pointer-report.json)。
- `node tests/cocos-ads.browser.mjs`：缺 SDK、完整观看/中途退出、共享 H5 provider、广告隐藏/返回和迟到回调等生产包 fixture 检查通过；[报告](dev/ads-mockSDK-report.json)。这是模拟 SDK 回调，不是真实广告填充或手机设备验证。
- 普通提交 hook 正常执行；整合提交的 staged format 检查通过。推送保留 pre-push 与非快进保护。

本次按仓库手动校验约定执行定向检查，没有运行完整 `validate:candidate`，也不声明 `CANDIDATE_VALIDATED`。Git 推送、CI 与 Pages 部署状态分别核对；推送不等于部署通过。Android/iOS 真机、原生平台与真实广告库存未验收。
