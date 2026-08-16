const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, Tray } = require('electron')
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const READY_URL = /dsh web:\s+(https?:\/\/[^\s]+)/i
const DSH_START_TIMEOUT_MS = 90000
const APP_ICON = path.join(__dirname, 'assets', 'icon.ico')
const LOADING_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`
  <!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <style>
        :root { color-scheme: dark; }
        html, body { width: 100%; height: 100%; margin: 0; }
        body {
          display: grid;
          place-items: center;
          overflow: hidden;
          color: #e6e6e7;
          background: #111113;
          font: 15px "Segoe UI", "Microsoft YaHei", sans-serif;
        }
        .loading { display: grid; gap: 18px; justify-items: center; }
        .mark {
          width: 42px;
          height: 42px;
          border: 3px solid #4e76b8;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
        }
        .hint { color: #a4a4aa; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body data-dsh-loading>
      <div class="loading">
        <div class="mark"></div>
        <div>正在启动 DeepSeek Harness…</div>
        <div class="hint">正在准备本地 WebUI</div>
      </div>
    </body>
  </html>
`)}`

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.setAppUserModelId('com.deepseekh.desktop.shell')

let mainWindow = null
let dshProcess = null
let tray = null
let closingApplication = false
let hiddenToTray = false
let taskRunning = false
let completionTimer = null

function findOnPath(fileName) {
  const pathValue = process.env.PATH || ''
  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) continue
    const candidate = path.join(directory.replace(/^"|"$/g, ''), fileName)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function resolveProjectRoot() {
  const candidates = [
    process.env.DSH_PROJECT_ROOT,
    process.env.PORTABLE_EXECUTABLE_DIR,
    process.cwd(),
    __dirname,
    path.dirname(process.execPath),
  ].filter(Boolean)

  for (const start of candidates) {
    let current = path.resolve(start)
    while (true) {
      if (
        fs.existsSync(path.join(current, 'package.json'))
        && fs.existsSync(path.join(current, 'apps', 'cli', 'src', 'bin.ts'))
      ) {
        return current
      }
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return null
}

function startDsh(projectRoot) {
  const node = findOnPath('node.exe')
  const pnpm = findOnPath('pnpm.cmd')
  let command
  let args

  if (node) {
    command = node
    args = ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--port', '0']
  } else if (pnpm) {
    command = pnpm
    args = ['dsh', 'web', '--port', '0']
  } else {
    throw new Error('找不到 Node.js 或 pnpm，请先安装 Node.js。')
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let output = ''
    let diagnostic = ''
    const finish = (error, url) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve(url)
    }

    const child = spawn(command, args, {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    dshProcess = child

    const readOutput = chunk => {
      const text = String(chunk)
      diagnostic = `${diagnostic}${text}`.slice(-8000)
      output += text
      const lines = output.split(/\r?\n/)
      output = lines.pop() || ''
      for (const line of lines) {
        const match = READY_URL.exec(line)
        if (match) return finish(null, match[1].replace(/[.,]$/, ''))
      }
    }
    child.stdout.on('data', readOutput)
    child.stderr.on('data', readOutput)
    child.once('error', error => finish(error))
    child.once('exit', (code, signal) => {
      if (!settled) {
        const detail = diagnostic.trim()
        finish(new Error(`DSH 启动失败 code=${code} signal=${signal}${detail ? `\n\n${detail}` : ''}`))
      }
    })

    const timeout = setTimeout(() => {
      const detail = diagnostic.trim()
      finish(new Error(`DSH 启动超时。${detail ? `\n\n${detail}` : ''}`))
    }, DSH_START_TIMEOUT_MS)
  })
}

function stopDsh() {
  const child = dshProcess
  dshProcess = null
  if (!child || child.exitCode !== null) return Promise.resolve()

  return new Promise(resolve => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      resolve()
    }
    child.once('exit', finish)

    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } else {
      try { child.kill('SIGTERM') } catch {}
    }
    setTimeout(finish, 8000)
  })
}

function registerWindowControls() {
  ipcMain.on('window-minimize', () => mainWindow?.minimize())
  ipcMain.on('window-toggle-maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window-close', () => hideToTray())
  ipcMain.on('task-state', (_event, state) => {
    const running = state?.running === true
    const completedWhileHidden = hiddenToTray && taskRunning && !running
    taskRunning = running
    if (running) {
      cancelCompletionNotification()
    } else if (completedWhileHidden) {
      scheduleTaskCompletedNotification()
    }
  })
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  cancelCompletionNotification()
  hiddenToTray = false
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  tray?.setToolTip(taskRunning ? 'DeepSeek Harness（任务运行中）' : 'DeepSeek Harness')
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  hiddenToTray = true
  mainWindow.hide()
  tray?.setToolTip(taskRunning ? 'DeepSeek Harness（任务运行中）' : 'DeepSeek Harness')
}

function cancelCompletionNotification() {
  if (completionTimer === null) return
  clearTimeout(completionTimer)
  completionTimer = null
}

function scheduleTaskCompletedNotification() {
  cancelCompletionNotification()
  completionTimer = setTimeout(() => {
    completionTimer = null
    if (hiddenToTray && !taskRunning) notifyTaskCompleted()
  }, 800)
}

function notifyTaskCompleted() {
  tray?.setToolTip('DeepSeek Harness')
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: 'DeepSeek Harness',
    body: '任务已完成，点击通知返回会话。',
    icon: APP_ICON,
  })
  notification.on('click', showWindow)
  notification.show()
}

function createTray() {
  if (tray) return
  tray = new Tray(APP_ICON)
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 DeepSeek Harness', click: showWindow },
    { type: 'separator' },
    { label: '退出程序', click: () => { void closeApplication() } },
  ]))
  tray.on('click', showWindow)
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: 'DeepSeek Harness',
    icon: APP_ICON,
    show: false,
    frame: false,
    backgroundColor: '#111113',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('close', event => {
    if (closingApplication) return
    event.preventDefault()
    hideToTray()
  })
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.maximize()
  })

  await mainWindow.loadURL(LOADING_PAGE)
  await installWindowControls()
}

async function installWindowControls() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  await mainWindow.webContents.executeJavaScript(`(() => {
    if (document.getElementById('dsh-electron-window-controls')) return

    document.documentElement.dataset.dshElectronShell = 'true'

    const style = document.createElement('style')
    style.id = 'dsh-electron-window-controls-style'
    style.textContent = \`
      html[data-dsh-electron-shell='true'] body {
        box-sizing: border-box !important;
        width: 100% !important;
        height: 100% !important;
        padding-top: 36px !important;
        overflow: hidden !important;
      }
      html[data-dsh-electron-shell='true'] body > #root {
        height: 100% !important;
        min-height: 0 !important;
      }
      #dsh-electron-window-titlebar {
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        left: 0 !important;
        z-index: 2147483645 !important;
        display: block !important;
        width: 100% !important;
        height: 36px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: var(--dsw-alias-bg-base, #111113) !important;
        border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08)) !important;
        pointer-events: none !important;
      }
      body:not([data-dsh-loading]):not([data-ds-dark-theme]) ~ #dsh-electron-window-titlebar {
        background: #ffffff !important;
        border-bottom-color: rgba(0, 0, 0, 0.10) !important;
      }
      #dsh-electron-window-controls {
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        z-index: 2147483647 !important;
        display: flex !important;
        flex-direction: row !important;
        width: 138px !important;
        height: 36px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        user-select: none !important;
      }
      body:not([data-dsh-loading]):not([data-ds-dark-theme]) ~ #dsh-electron-window-controls {
        background: transparent;
      }
      #dsh-electron-window-drag-region {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 138px !important;
        z-index: 2147483646 !important;
        display: block !important;
        width: auto !important;
        height: 36px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        -webkit-app-region: drag !important;
      }
      #dsh-electron-window-controls button {
        flex: 1 1 0 !important;
        width: 46px !important;
        height: 36px !important;
        min-width: 46px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        outline: 0 !important;
        display: block !important;
        color: #f4f4f5;
        background: transparent !important;
        font: 15px/36px "Segoe UI", sans-serif;
        text-align: center;
        cursor: pointer;
        -webkit-app-region: no-drag !important;
      }
      #dsh-electron-window-controls button:hover { background: #2d2d30; }
      #dsh-electron-window-controls button:last-child:hover { background: #c42b3c; }
      body:not([data-dsh-loading]):not([data-ds-dark-theme]) ~ #dsh-electron-window-controls button {
        color: #1f1f21;
      }
      body:not([data-dsh-loading]):not([data-ds-dark-theme]) ~ #dsh-electron-window-controls button:hover {
        background: #eef0f3;
      }
      body:not([data-dsh-loading]):not([data-ds-dark-theme]) ~ #dsh-electron-window-controls button:last-child:hover {
        color: #ffffff;
        background: #c42b3c;
      }
      #dsh-electron-window-controls .minimize { font-size: 18px; }
      #dsh-electron-window-controls .maximize { font-size: 15px; }
      #dsh-electron-window-controls .close { font-size: 22px; font-weight: 300; }
    \`
    document.head.appendChild(style)

    const controls = document.createElement('div')
    controls.id = 'dsh-electron-window-controls'
    controls.innerHTML = \`
      <button class="minimize" title="最小化" aria-label="最小化">−</button>
      <button class="maximize" title="最大化/还原" aria-label="最大化/还原">□</button>
      <button class="close" title="关闭" aria-label="关闭">×</button>
    \`
    controls.querySelector('.minimize').addEventListener('click', () => window.windowControls?.minimize())
    controls.querySelector('.maximize').addEventListener('click', () => window.windowControls?.toggleMaximize())
    controls.querySelector('.close').addEventListener('click', () => window.windowControls?.close())
    const titlebar = document.createElement('div')
    titlebar.id = 'dsh-electron-window-titlebar'
    const dragRegion = document.createElement('div')
    dragRegion.id = 'dsh-electron-window-drag-region'

    // Keep the critical shell geometry inline as well as in the stylesheet.
    // The WebUI injects its own global rules after boot; inline !important
    // prevents those rules from moving the chrome into normal flow.
    const important = (element, property, value) => {
      element.style.setProperty(property, value, 'important')
    }
    const body = document.body
    const root = document.getElementById('root')
    important(body, 'box-sizing', 'border-box')
    important(body, 'width', '100%')
    important(body, 'height', '100%')
    important(body, 'padding-top', '36px')
    important(body, 'overflow', 'hidden')
    if (root) {
      important(root, 'height', '100%')
      important(root, 'min-height', '0')
    }
    for (const [property, value] of [
      ['position', 'fixed'], ['top', '0'], ['right', '0'], ['left', '0'],
      ['z-index', '2147483645'], ['display', 'block'], ['width', '100%'],
      ['height', '36px'], ['margin', '0'], ['padding', '0'],
      ['pointer-events', 'none'],
    ]) important(titlebar, property, value)
    for (const [property, value] of [
      ['position', 'fixed'], ['top', '0'], ['right', '0'],
      ['z-index', '2147483647'], ['display', 'flex'], ['flex-direction', 'row'],
      ['width', '138px'], ['height', '36px'], ['margin', '0'], ['padding', '0'],
      ['user-select', 'none'],
    ]) important(controls, property, value)
    for (const [property, value] of [
      ['position', 'fixed'], ['top', '0'], ['left', '0'], ['right', '138px'],
      ['z-index', '2147483646'], ['display', 'block'], ['width', 'auto'],
      ['height', '36px'], ['margin', '0'], ['padding', '0'],
      ['pointer-events', 'none'], ['-webkit-app-region', 'drag'],
    ]) important(dragRegion, property, value)
    for (const button of controls.querySelectorAll('button')) {
      for (const [property, value] of [
        ['flex', '1 1 0'], ['display', 'block'], ['width', '46px'],
        ['min-width', '46px'], ['height', '36px'], ['margin', '0'], ['padding', '0'],
        ['border', '0'], ['outline', '0'], ['background', 'transparent'],
        ['text-align', 'center'], ['cursor', 'pointer'],
        ['-webkit-app-region', 'no-drag'],
      ]) important(button, property, value)
      button.addEventListener('mouseenter', () => { important(button, 'background', '#2d2d30') })
      button.addEventListener('mouseleave', () => { important(button, 'background', 'transparent') })
    }
    const updateChromeTheme = () => {
      const light = !body.hasAttribute('data-ds-dark-theme') && !body.hasAttribute('data-dsh-loading')
      important(titlebar, 'background', light ? '#ffffff' : '#111113')
      important(titlebar, 'border-bottom-color', light ? 'rgba(0, 0, 0, 0.10)' : 'rgba(255, 255, 255, 0.08)')
      for (const button of controls.querySelectorAll('button')) important(button, 'color', light ? '#1f1f21' : '#f4f4f5')
    }
    updateChromeTheme()
    new MutationObserver(updateChromeTheme).observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'data-dsh-loading'] })
    // Keep the shell chrome outside #root and body so the WebUI layout cannot
    // move or restyle it as ordinary page content.
    document.documentElement.appendChild(titlebar)
    document.documentElement.appendChild(dragRegion)
    document.documentElement.appendChild(controls)
  })()`, true)
}

async function closeApplication() {
  if (closingApplication) return
  closingApplication = true
  await stopDsh()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy()
  app.quit()
}

async function boot() {
  const projectRoot = resolveProjectRoot()
  if (!projectRoot) {
    throw new Error(
      '找不到 DeepSeek Harness 项目目录。\n\n'
      + '请把程序放在项目目录内，或设置 DSH_PROJECT_ROOT。',
    )
  }

  await createWindow()
  const webUrl = await startDsh(projectRoot)
  if (closingApplication || !mainWindow || mainWindow.isDestroyed()) return
  await mainWindow.loadURL(webUrl)
  await installWindowControls()
  await installTaskStateObserver()
}

async function installTaskStateObserver() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  await mainWindow.webContents.executeJavaScript(`(() => {
    if (window.__dshElectronTaskStateObserver) return
    window.__dshElectronTaskStateObserver = true

    const isRunning = () => document.querySelector(
      'button[aria-label="停止生成"], button[aria-label="Stop generating"]',
    ) !== null
    let last = null
    const publish = () => {
      const current = isRunning()
      if (current === last) return
      last = current
      window.windowControls?.taskState(current)
    }
    new MutationObserver(publish).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    })
    publish()
  })()`, true)
}

registerWindowControls()

app.on('second-instance', () => {
  showWindow()
})

app.on('before-quit', event => {
  if (closingApplication || !dshProcess) return
  event.preventDefault()
  void closeApplication()
})

app.whenReady().then(() => {
  createTray()
  return boot()
}).catch(async error => {
  await stopDsh()
  dialog.showErrorBox('DeepSeek Harness', error.message)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  cancelCompletionNotification()
  tray?.destroy()
  tray = null
})
