const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopInfo', {
  isDesktop: true,
  platform: process.platform,
})

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  taskState: running => ipcRenderer.send('task-state', { running: Boolean(running) }),
})
