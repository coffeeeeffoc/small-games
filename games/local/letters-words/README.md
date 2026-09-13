# 词了个词 · 单词消消乐

一个零依赖、可在手机和桌面浏览器游玩的 H5 单词拼写游戏。

## 玩法

- 进入游戏随机抽取 6 组英文单词与中文含义，所有单词共用一个字母棋盘。
- 根据中文含义点击字母或符号拼词，格子右上角显示剩余数量；重复字母可以连续选取。
- 拼满后自动校验，正确才消耗对应字母；拼完全部单词即通关。
- 可撤回、清空或使用提示，也可用键盘输入，按 Backspace 撤回。
- 自定义词库支持每行“英文 + 中文”，例如 `apple 苹果`；连字符、句点和英文撇号也可参与拼写，弯撇号会自动转为英文撇号。

## 运行

需要 Node.js 18 或更新版本，无需安装依赖。

```sh
npm start
npm test
```

打开 <http://127.0.0.1:4186>。在 PowerShell 中可用 `$env:PORT=4187; npm start` 更换端口。

可选真实浏览器回归：先启动游戏，再在已安装 Playwright 和 Chrome 的环境运行 `node browser-check.mjs`。脚本会验证桌面与手机完整通关流程，并将截图保存到 `artifacts/`。

```powershell
$env:GAME_URL='http://127.0.0.1:4187'
# 使用已有的 Playwright 模块时，设置它的绝对文件路径；默认导入 playwright。
$env:PLAYWRIGHT_MODULE='F:\path\to\node_modules\playwright\index.mjs'
node browser-check.mjs
```

## 文件与部署

- `index.html`、`style.css`、`app.mjs`：界面、样式与交互。
- `game.mjs`、`game.test.mjs`：游戏规则与 Node.js 自检。
- `browser-check.mjs`：可选的桌面与手机真实浏览器回归。
- `favicon.svg`：网站图标。
- `server.mjs`：仅供本地开发的静态服务，仅开放上述前端文件。

无需构建，将 `index.html`、`style.css`、`app.mjs`、`game.mjs` 和 `favicon.svg` 上传到任意静态网站托管服务即可。托管服务需将 `.mjs` 作为 JavaScript 返回。
