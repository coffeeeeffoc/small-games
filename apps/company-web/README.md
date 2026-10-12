# 能工智人公司官网

上海能工智人科技有限公司的中文介绍站，涵盖公司介绍、软件开发、小游戏、AI 应用与产品理念。独立 pnpm workspace，使用现有 Vite 构建静态 HTML/CSS 和原生 JavaScript，不依赖游戏大厅或后端服务。

在仓库根目录运行：

```bash
pnpm --filter @coffeeeeffoc/company-web dev
pnpm --filter @coffeeeeffoc/company-web build
pnpm --filter @coffeeeeffoc/company-web preview
pnpm --filter @coffeeeeffoc/company-web test
```

开发地址为 `http://127.0.0.1:5180`，生产预览地址为 `http://127.0.0.1:4180`。测试需要本机已安装 Playwright Chromium；检查生产构建在 `/small-games/company/` 子路径下的资源、导航、键盘操作、1440/390/320 像素布局、动效开关、鼠标倾斜、系统减少动态效果与触摸行为，截图输出至根目录 `outputs/company-web/`。CI 使用 `PAGES_BASE_PATH` 检查对应分支的实际子路径。

构建输出在 `apps/company-web/dist/`，可独立托管在域名根目录或子目录。GitHub Pages 流程在官网构建及浏览器测试通过后，将产物复制到游戏站点的 `company/` 子目录，保留现有游戏大厅及各分支入口。推送 `main`、`dev`、`test` 后自动发布对应版本：

- 正式官网：<https://coffeeeeffoc.github.io/small-games/company/>
- 开发预览：<https://coffeeeeffoc.github.io/small-games/dev/company/>
- 测试预览：<https://coffeeeeffoc.github.io/small-games/test/company/>（该分支接入此配置并发布后生效）

公司介绍与业务文案维护在 `index.html`，样式在 `src/style.css`。网站无外部字体、图片、统计脚本或表单。公司正式 Logo、对外联系方式、备案信息尚未提供，当前使用文字标识与原创几何装饰；获得确认后再添加正式资料。

背景光晕、悬浮字形与轨道使用 CSS 动画；`src/motion.js` 处理鼠标高光、卡片倾斜和动效开关，无动画库。鼠标效果仅在精细鼠标设备上启用；页面不可见时停止动画，系统减少动态效果设置优先于手动开关。JavaScript 不可用时仍展示完整内容与静态视觉。
