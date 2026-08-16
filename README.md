# deepseek-harness-desktop

DeepSeek Harness 的个人桌面发行层：dsh 本体以 git 子模块方式引入（官方上游，钉在固定 commit），本仓库只管理自己的东西（插件、Electron 桌面壳、一键脚本）。

## 目录结构

```text
deepseek-harness-desktop/
├── deepseek-harness/         # git 子模块：deepseek-ai/deepseek-harness @ 47f943859b（固定版本）
├── plugins/                  # 8 个自研插件（dsh-background、dsh-font、dsh-codex-* 等）
├── desktop-shell-electron/   # Electron 桌面壳（独立 npm 包，自包含）
├── start-deepseek-harness.bat
├── restart-deepseek-harness.bat
├── build-webui-shell-electron.bat
├── start-webui-shell-electron.bat
└── README.zh.md
```

## 首次使用

1. 克隆并初始化子模块：

   ```sh
   git clone https://github.com/ChiYuKe/deepseek-harness-desktop.git
   cd deepseek-harness-desktop
   git submodule update --init --recursive
   ```

2. 安装 dsh 依赖并构建 WebUI（在 `deepseek-harness/` 内）：

   ```sh
   cd deepseek-harness
   pnpm install
   pnpm run build
   ```

3. 配置插件接入：`$DSH_HOME\profiles\web\package.json` 里的 `link:` 路径指向本仓库的 `plugins/` 目录（见「插件」）。

## 一键脚本

- `start-deepseek-harness.bat`：在 `deepseek-harness\` 子模块内安装依赖、构建并启动 Web UI（默认 `http://127.0.0.1:3080`）；
- `restart-deepseek-harness.bat`：结束占用 3080 端口的旧进程后重新启动；
- `build-webui-shell-electron.bat`：构建 Electron 桌面壳（install → check → electron-builder portable）；
- `start-webui-shell-electron.bat`：启动 Electron 桌面壳（优先目录版，缺产物自动构建），通过 `DSH_PROJECT_ROOT` 指向 `deepseek-harness\` 子模块。

壳的详细说明见 [desktop-shell-electron/README.zh.md](desktop-shell-electron/README.zh.md)。

## 子模块版本

子模块固定在 `47f943859b`（与插件开发时的上游版本一致）。升级方式：

```sh
cd deepseek-harness
git fetch origin
git checkout <新commit>        # 或 git pull 到新版本后手动 checkout
cd ..
git add deepseek-harness && git commit -m "chore: bump deepseek-harness"
```

## 插件

插件是带 `dsh.bundle.patch` 的独立包，不属于 dsh 的 pnpm workspace。接入方式：

- `$DSH_HOME\profiles\web\package.json` 的 `dependencies` 用 `link:` 指向本仓库 `plugins/` 下的目录；
- `dsh.profile.bundles` 按顺序列出插件名；
- 插件改动后无需重新安装，profile 通过链接直接读到新代码（客户端插件需重新 `tsdown` 构建 `lib/`）。

## 已知限制

- 子模块为纯净上游，不含旧 fork 里的 `api-proxy.ts` 补丁（`ui-background` 设置白名单），因此 background 插件的设置页可能不显示；插件其余功能不受影响。
- 旧仓库 https://github.com/ChiYuKe/deepseek-harness 保留作备份（含完整旧历史），确认稳定后可删除。

## 许可证

[MIT](LICENSE)，与官方 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 一致。子模块 `deepseek-harness/` 遵循其自身的 MIT 许可（见 `deepseek-harness/LICENSE`）。
