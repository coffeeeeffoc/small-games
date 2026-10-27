# 无界滑行 · Skybound Odyssey

横屏 H5 速度冒险原型。雪山→古树→瀑布→云海→浪尖，滑板、滑翔机、冲浪板自动接力；躲避橙色障碍、减速对准金色门，收集偏离稳妥路线的星屑。撞击、离轨和错误过门会失败。同路线重试保留种子，换路线生成新组合；三航线依次解锁，无尽远征首局开放。

- 触屏：左下按住左右或拖动转向，右下按住减速。支持多点触控。
- 倾斜：设置内主动开启并校准；权限拒绝或无传感器数据时仍可触屏。
- 键盘：← → / A D 转向，空格减速，Esc 暂停。
- 静态独立地址 `/games/skybound-odyssey/index.html`；Shell `#/games/skybound-odyssey`。
- `?dev=1` 使用公共开发模式；试玩不写入通关进度。

```sh
pnpm --filter @coffeeeeffoc/skybound-odyssey dev
pnpm --filter @coffeeeeffoc/skybound-odyssey test
pnpm --filter @coffeeeeffoc/skybound-odyssey build
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @coffeeeeffoc/skybound-odyssey test:browser
```

默认端口4477。无第三方运行依赖。核心模拟与内容配置独立，Game Host 本地存档不可用时保留会话内进度。渲染采用Canvas透视，不是自由3D或Cocos原生平台制品。本次范围来自用户的“初步原型”要求；正式移动端扩展按产品方案分批实施。

[产品与分批实施方案](docs/design/product.md) · [设计效果图](docs/design/concept.png) · [验证记录](docs/qa/verification.md) · [上架资料状态](publishing/STATUS.md)
