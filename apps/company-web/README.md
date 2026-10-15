# 能工智人公司官网

自有服务器更新使用根目录命令 `pnpm deploy:company`，回滚用 `pnpm deploy:company --rollback`，两者只切换静态版本，不重启 Caddy。仅准备包用 `--prepare`，见[官网发布说明](../../infra/company/README.md)；首次拆分、证书卷与备份由独立的 [Caddy 运维命令](../../infra/caddy/README.md)管理。

上海能工智人科技有限公司的中文介绍站，涵盖公司介绍、软件开发、小游戏、AI 应用与产品理念。独立 pnpm workspace，使用现有 Vite 构建静态 HTML/CSS 和原生 JavaScript，不依赖游戏大厅或后端服务。

在仓库根目录运行：

```bash
pnpm --filter @coffeeeeffoc/company-web dev
pnpm --filter @coffeeeeffoc/company-web build
pnpm --filter @coffeeeeffoc/company-web preview
pnpm --filter @coffeeeeffoc/company-web test
```

开发地址为 `http://127.0.0.1:5180`，生产预览地址为 `http://127.0.0.1:4180`。测试需要本机已安装 Playwright Chromium；检查生产构建在 `/small-games/company/` 子路径下的资源、导航、键盘操作、1440/1024/768/390/320 像素布局、动效开关、鼠标倾斜、系统减少动态效果与触摸行为，截图输出至根目录 `outputs/company-web/`。CI 使用 `PAGES_BASE_PATH` 检查对应分支的实际子路径。

构建输出在 `apps/company-web/dist/`，可独立托管在域名根目录或子目录。GitHub Pages 流程在官网构建及浏览器测试通过后，将产物复制到游戏站点的 `company/` 子目录，保留现有游戏大厅及各分支入口。推送 `main`、`dev`、`test` 后自动发布对应版本：

- 正式官网：<https://coffeeeeffoc.github.io/small-games/company/>
- 开发预览：<https://coffeeeeffoc.github.io/small-games/dev/company/>
- 测试预览：<https://coffeeeeffoc.github.io/small-games/test/company/>（该分支接入此配置并发布后生效）

公司介绍与业务文案维护在 `index.html`，样式在 `src/style.css`。网站无外部字体、图片、统计脚本或表单。页脚展示备案号「沪ICP备2026053115号-1」，链接至工信部备案查询网站。对外联系方式尚未提供，获得确认后再添加。

品牌视觉采用用户确认的[晴空科技设计图](docs/design/sunlight/approved.png)：晴空蓝、电光青与饱和钴蓝 `#004bff`，搭配阳光橙 `#ff6b0b` 和明黄 `#ffdf39`。首屏是贯通导航的城市天空场景，业务区与页尾横幅按后续反馈调为浅天空蓝渐变，搭配深蓝文字；业务卡片保持浅青、杏橙、明黄，公司介绍与理念延续明亮的蓝色体系。

`public/brand-mark.svg` 是蓝色折带 N 与橙色四角星组成的导航标识，`public/favicon.svg` 是小尺寸简化版。`public/assets/` 下的四张 WebP 为基于确认图生成的本地视觉素材：无文字的玻璃 N 首屏场景，以及透明底的软件、游戏、AI 图标，总计约 370 KiB。原始确认图保存在设计目录。首屏图片优先加载，业务图标延迟加载，无外部图片或字体依赖。

所有文案、导航和按钮均为真实 HTML。三张业务卡片使用原生 `details/summary` 展开介绍，支持鼠标、触摸和键盘，在 JavaScript 不可用时仍能使用。手机端将天空场景重新构图到文案下方，避免裁切主体。

城市与地平线保持静止，独立星芒、光点和光轨使用 CSS 动画；`src/motion.js` 处理鼠标高光、卡片倾斜和动效开关，无动画库。鼠标效果仅在精细鼠标设备上启用；页面不可见时停止动画，系统减少动态效果设置优先于手动开关。JavaScript 不可用时仍展示完整内容与静态视觉。
