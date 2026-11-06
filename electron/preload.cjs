const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pexx', {
  getBrain: () => ipcRenderer.invoke('brain:get'),
})
