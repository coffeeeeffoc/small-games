# 角色区分验证

2026-10-11，基于 dev `eb76c5b0ebe0beca1c9a36796335421f8a134546`。环境：Linux，Node 24.21.0，pnpm 12.6.0，Chromium。Web 使用实际 `build.mjs` 生产产物与 `server.mjs --dist`；手机尺寸和 CDP 输入均为浏览器模拟。

## 通过的检查

| 检查                                                                               | 结果与证据                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @coffeeeeffoc/wulong-city test`                                     | 102 / 102，通过且无跳过。包括餐厅和队伍人物唯一性、固定身份、NPC 不随主角移动、素材失败时独立降级、预览/记忆/狗背主角保留、九种人物（含小岔）的独立 PNG RGBA 文件。                                                                                                                        |
| `pnpm --filter @coffeeeeffoc/wulong-city test:characters:browser`                  | 16 / 16。390 × 844 和 320 × 568 检查 8、17、19、12、14、23、24 的实际人物图像；检查比例、脚部基线、按需请求、取消移动、暂停恢复、回到选关复用素材。额外检查两张 NPC 素材请求失败仍能拿饭，以及受控挂起请求后从降级形象切回正确素材。无页面异常；[浏览器报告](actual/browser-report.json)。 |
| `pnpm --filter @coffeeeeffoc/wulong-city test:mobile`                              | 320 × 568、390 × 844、844 × 390 的主页、100 关选关、手记、设置、游玩、提示、暂停和返回均无横向溢出。真实 CDP 多点触屏同时移动和跳跃，取消与暂停释放输入，方向变化保留关卡，触屏完成关卡并重玩；[手机流程报告](actual/mobile-report.json)。                                                 |
| `INPUT=touch FLOW=1 node games/local/wulong-city/tests/playtest.mjs 8 17 19 12 14` | 五关全部触屏通关，验证下一关、菜单重访、重玩和两次重试；[报告](actual/touch-main-report.json)。                                                                                                                                                                                            |
| `INPUT=touch FLOW=1 node games/local/wulong-city/tests/playtest.mjs 23 24`         | 长话桥与画外奖杯全部触屏通关，验证下一关、菜单重访、重玩和两次重试；[报告](actual/touch-extra-report.json)。                                                                                                                                                                               |
| 微信 Canvas 预览包                                                                 | 构建成功，包含全部八张新人物 PNG。`native-game-smoke.mjs --standalone --platform wechat --game wulong-city` 通过；`native/browser-check.mjs` 在实际包上验证七页、触屏通关、暂停、存档和退出清理，无页面异常；[宿主模拟记录](native-actual/verification.json)。                             |

人物源图来自 image_gen；只对生成图执行常规分格裁切、去透明边和等比例尺寸转换，生成 480 px 高的独立透明 PNG。未改变现有小岔素材。按需加载使餐厅只请求服务员和值班员，队伍只请求三位居民，备用邮差不产生启动请求。

## 画面核对

- [390 餐厅](actual/level-8-390.png)、[320 餐厅](actual/level-8-320.png)：小岔、围裙服务员和蓝制服值班员各有形象。
- [390 队伍](actual/level-17-390.png)、[320 队伍](actual/level-17-320.png)：银发眼镜爷爷、卷发红衣阿姨和长辫姑娘的头脸可见；申请表已移到胸前。
- [演员](actual/level-19-390.png)、[单一小岔领奖场景](actual/level-24-390.png)、[缺素材降级](actual/diner-missing-art-390.png)。

只读复核未发现本次新增的阻断问题，所指出的申请表遮脸和新测试暂停按钮选择器问题已修正并重跑。最终提交后仍按仓库流程针对准确 base/head 验证候选，保留正常 hooks；完整候选与推送日志保存在执行环境 `/workspace/wulong-publication/`。

未进行手机真机或原生平台实机验收。微信结果是预览包和 SDK 浏览器模拟，不代表渠道发布；其余原生平台遵循默认延后门禁。GitHub API 的工作流状态读取受本环境网络策略限制，不能将本地通过等同于线上 CI 或 Pages 部署成功。
