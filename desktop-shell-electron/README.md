# DeepSeek Harness Electron 桌面壳

`desktop-shell-electron/` 是 DSH 的 Electron 桌面壳：用内嵌 Chromium 以独立的无边框窗口加载当前项目的 DSH WebUI，不需要打开浏览器，也不依赖系统 WebView2 或 Edge。

## 功能

- **一键启动 WebUI**：自动从源码启动当前项目的 DSH（`node --import tsx/esm apps/cli/src/bin.ts web --port 0`），端口由 DSH 动态分配，不会与已有的 3080 等服务冲突；
- **无边框窗口**：自绘 36px 标题栏（拖拽区 + 最小化 / 最大化 / 关闭按钮），跟随 WebUI 的深色 / 浅色主题自动切换配色；
- **启动加载页**：窗口先显示加载动画，等服务就绪后再载入 WebUI，不用干等；
- **托盘驻留**：点击关闭按钮只是把窗口隐藏到系统托盘，DSH 继续在后台运行；从托盘菜单选「退出程序」才真正退出，退出时会自动结束本次启动的 DSH 进程；
- **任务完成通知**：窗口隐藏在托盘期间，会话任务运行完毕会弹出系统通知，点击通知回到窗口；
- **单实例**：重复启动只会把已有窗口带到前台。

## 使用

在项目根目录双击 `build-webui-shell-electron.bat` 构建：

1. 若 `desktop-shell-electron/node_modules` 里没有 Electron，会自动执行 `npm install`；
2. 语法检查 `main.cjs` / `preload.cjs`；
3. 执行 `electron-builder --win portable` 打包。

产物在 `desktop-shell-electron/publish/`：

- `win-unpacked/DeepSeek Harness.exe`：目录版，解压后直接运行，启动快；
- `DeepSeekHarness-Electron-Portable.exe`：便携单文件版，适合拷贝分发，每次启动需要解压。

再双击 `start-webui-shell-electron.bat` 启动：脚本优先使用目录版（启动更快），不存在时退回便携版，两者都没有时会先自动构建；脚本会把项目根目录通过 `DSH_PROJECT_ROOT` 环境变量传给壳。

开发调试时也可以在 `desktop-shell-electron/` 里直接 `npm start`。

## 要求

- Windows + Node.js；壳以源码方式运行 DSH，仓库依赖需已安装（根目录存在 `node_modules`），无需全局安装 pnpm；
- 壳需要能找到 DSH 项目目录：优先读 `DSH_PROJECT_ROOT`，否则从程序所在位置逐级向上查找同时包含 `package.json` 与 `apps/cli/src/bin.ts` 的目录；找不到时会弹窗报错；
- 首次使用前建议先运行一次 `start-deepseek-harness.bat`（或 `pnpm run build`）构建 WebUI 前端产物；若 WebUI 空白，先执行这一步再重试。

## 说明

- 关闭窗口 ≠ 退出：窗口隐藏到托盘，DSH 继续运行；只有托盘菜单「退出程序」才真正退出，并先结束自己启动的 DSH 子进程（Windows 下按进程树强制结束）；
- 启动失败（找不到 Node.js、DSH 启动报错或 90 秒超时）会弹出错误对话框，并附上 DSH 启动输出的诊断信息；
- 壳通过解析 DSH 启动日志中的 `dsh web: http://…` 行获取实际地址，端口由 DSH 动态分配；
- 不改动 DSH 任何源码，纯外壳。
