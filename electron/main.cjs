const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const { readBrain } = require('./brain.cjs')

let mainWindow
let pendingRead

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#151713',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault())
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  ipcMain.handle('brain:get', event => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unavailable')
    if (!pendingRead) pendingRead = readBrain(path.join(app.getPath('desktop'), 'AI')).finally(() => { pendingRead = null })
    return pendingRead
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
