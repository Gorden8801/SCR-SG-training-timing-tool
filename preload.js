const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winAPI', {
  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
  toggleTop: () => ipcRenderer.invoke('win:toggle-top'),
  captureScreenshot: (folder) => ipcRenderer.invoke('screenshot:capture', folder),
  openScreenshotFolder: (folder) => ipcRenderer.invoke('screenshot:open-folder', folder),
  listScreenshots: (folder) => ipcRenderer.invoke('screenshot:list', folder),
  deleteScreenshot: (fullPath) => ipcRenderer.invoke('screenshot:delete', fullPath),
  enterInputMode: () => ipcRenderer.send('win:enter-input'),
  exitInputMode: () => ipcRenderer.send('win:exit-input'),
  getShortcut: () => ipcRenderer.invoke('shortcut:get'),
  setShortcut: (accel) => ipcRenderer.invoke('shortcut:set', accel),
  onScreenshotSaved: (cb) => ipcRenderer.on('screenshot:saved', (e, data) => cb(data)),
  onTriggerScreenshot: (cb) => ipcRenderer.on('trigger-screenshot', () => cb()),
  openNoteWin: (text) => ipcRenderer.send('open-note-win', text),
  closeNoteWin: () => ipcRenderer.send('close-note-win'),
  sendNoteChange: (text) => ipcRenderer.send('note-changed', text),
  enterNoteInput: () => ipcRenderer.send('note-win-enter-input'),
  exitNoteInput: () => ipcRenderer.send('note-win-exit-input'),
  onNoteInit: (cb) => ipcRenderer.on('note-init', (e, text) => cb(text)),
  onNoteSync: (cb) => ipcRenderer.on('note-sync', (e, text) => cb(text))
});

contextBridge.exposeInMainWorld('captureAPI', {
  getBackground: () => ipcRenderer.invoke('screenshot:get-bg'),
  sendRegion: (rect) => ipcRenderer.send('screenshot:region', rect),
  cancel: () => ipcRenderer.send('screenshot:cancel'),
  onNewBackground: (cb) => ipcRenderer.on('screenshot:new-bg', (e, dataURL) => cb(dataURL)),
  onClear: (cb) => ipcRenderer.on('screenshot:clear', () => cb())
});