# 微信原生小程序

在 echo-lab 目录安装开发依赖后执行 `npm run build:wechat`，将生成的 `dist-wechat/` 导入微信开发者工具（小程序类型）。此目录是源码，需通过构建将共享核心编译进工程，不能直接导入。

可设置 `WECHAT_APP_ID` 注入自己的 AppID；默认游客 AppID 不代表可正式预览/发布。录音、文件选择与分享需配置微信后台隐私保护指引并真机验收。内置声音和声学均在本机计算，无需 WebView 或后端域名。

界面以竖屏实验为主，原生导航避开胶囊，画布触摸按 CSS 像素映射并适配 DPR。音频复用共享测试音、路径增益、PCM/WAV 和裁切逻辑；录音使用 RecorderManager，导入使用 chooseMessageFile，输出通过 shareFileMessage。录音/输入不写入存档或配置。

导出支持分别分享原声、空间效果 WAV 以及跨端 JSON 配置；浏览器的双 WAV ZIP 与 URL 配置链接为 Web/H5 专属。存储不可用时仍可实验并手动导出。
