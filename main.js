const { app, BrowserWindow, ipcMain, desktopCapturer, screen, shell, nativeImage, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let captureWin = null;
let noteWin = null;
let captureReady = false;
let captureData = null;
let tray = null;
let userWantsTop = true;
let inputMode = false;
let isQuitting = false;
let tempGuard = null;

let currentShortcut = 'Alt+Q';

function getConfigPath() { return path.join(app.getPath('userData'), 'config.json'); }
function loadConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data.screenshotShortcut) currentShortcut = data.screenshotShortcut;
    }
  } catch (e) {}
}
function saveConfig() {
  try { fs.writeFileSync(getConfigPath(), JSON.stringify({ screenshotShortcut: currentShortcut }, null, 2)); } catch (e) {}
}

function tryRegister(accel) {
  try {
    return globalShortcut.register(accel, () => {
      if (win && !win.isDestroyed() && !(captureWin && captureWin.isVisible())) {
        win.webContents.send('trigger-screenshot');
      }
    });
  } catch (e) { return false; }
}
function registerShortcut(accel) {
  try { globalShortcut.unregisterAll(); } catch (e) {}
  if (tryRegister(accel)) { currentShortcut = accel; saveConfig(); return { ok: true, shortcut: accel }; }
  if (tryRegister(currentShortcut)) { return { ok: false, error: '快捷键被占用' }; }
  return { ok: false, error: '注册失败' };
}

function forceTop() {
  if (!win || win.isDestroyed() || !userWantsTop) return;
  try { win.setAlwaysOnTop(true, 'screen-saver'); if (typeof win.moveTop === 'function') win.moveTop(); } catch (e) {}
}
function startTempGuard(seconds) {
  if (tempGuard) clearInterval(tempGuard);
  let count = 0;
  const max = Math.max(2, Math.floor(seconds * 2));
  tempGuard = setInterval(() => {
    count++;
    if (count > max || !win || win.isDestroyed() || !userWantsTop) { clearInterval(tempGuard); tempGuard = null; return; }
    forceTop();
  }, 500);
}
function applyAlwaysOnTop() {
  if (!win || win.isDestroyed()) return;
  if (userWantsTop) forceTop(); else { try { win.setAlwaysOnTop(false); } catch (e) {} }
}

function quitApp() {
  if (isQuitting) return;
  isQuitting = true;
  try { globalShortcut.unregisterAll(); } catch (e) {}
  if (tempGuard) { try { clearInterval(tempGuard); } catch (e) {} }
  try { if (win && !win.isDestroyed()) win.hide(); } catch (e) {}
  try { if (noteWin && !noteWin.isDestroyed()) noteWin.hide(); } catch (e) {}
  try { if (captureWin && !captureWin.isDestroyed()) captureWin.hide(); } catch (e) {}
  try { if (tray && !tray.isDestroyed()) { tray.destroy(); tray = null; } } catch (e) {}
  try { if (captureWin && !captureWin.isDestroyed()) captureWin.destroy(); } catch (e) {}
  try { if (noteWin && !noteWin.isDestroyed()) noteWin.destroy(); } catch (e) {}
  captureWin = null; noteWin = null;
  try { if (win && !win.isDestroyed()) win.destroy(); } catch (e) {}
  win = null;
  setTimeout(() => { try { app.exit(0); } catch (e) {} }, 50);
}

function createWindow() {
  if (win && !win.isDestroyed()) { showMainWindow(); return; }
  win = new BrowserWindow({
    width: 320, height: 620,
    minWidth: 280, minHeight: 220,
    frame: false, resizable: true, alwaysOnTop: true, focusable: false,
    backgroundColor: '#faf5f0', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false
    }
  });
  win.loadFile('index.html');
  win.once('ready-to-show', () => { win.show(); forceTop(); startTempGuard(5); });
  win.on('blur', () => { if (!userWantsTop) return; setTimeout(forceTop, 30); setTimeout(forceTop, 120); startTempGuard(30); });
  win.on('focus', () => { if (userWantsTop) forceTop(); });
  win.on('always-on-top-changed', (e, isTop) => { if (userWantsTop && !isTop) setTimeout(forceTop, 100); });
  win.on('close', (e) => { if (isQuitting) return; e.preventDefault(); quitApp(); });
  win.on('closed', () => { if (!isQuitting) win = null; });
}

function createTray() {
  try {
    if (tray && !tray.isDestroyed()) return;
    let icon;
    const customIcon = path.join(__dirname, 'icon.png');
    if (fs.existsSync(customIcon)) icon = nativeImage.createFromPath(customIcon);
    else icon = nativeImage.createFromPath(process.execPath);
    tray = new Tray(icon);
    tray.setToolTip('SCR SG训练计时工具');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      { type: 'separator' },
      { label: '退出软件', click: quitApp }
    ]));
    tray.on('click', showMainWindow);
  } catch (e) {}
}

function preCreateCapture() {
  if (captureWin && !captureWin.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  captureWin = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height,
    frame: false, show: false, backgroundColor: '#000000', alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  captureWin.loadFile('selection.html');
  captureReady = false;
  captureWin.webContents.once('did-finish-load', () => { captureReady = true; });
  captureWin.on('close', (e) => { if (isQuitting) return; e.preventDefault(); if (captureWin && !captureWin.isDestroyed()) captureWin.hide(); showMainWindow(); });
  captureWin.on('closed', () => { captureWin = null; captureReady = false; });
}

async function warmUpDesktopCapturer() {
  try { await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 8, height: 8 } }); } catch (e) {}
}

app.whenReady().then(() => {
  loadConfig(); createWindow(); createTray(); preCreateCapture(); registerShortcut(currentShortcut);
  setTimeout(() => { warmUpDesktopCapturer(); }, 1500);
  setInterval(() => { if (win && !win.isDestroyed() && userWantsTop && !win.isAlwaysOnTop()) forceTop(); }, 2000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });

ipcMain.on('win:minimize', () => { if (win) win.minimize(); });
ipcMain.on('win:close', () => { if (win) win.close(); });
ipcMain.handle('win:toggle-top', () => { if (!win) return false; userWantsTop = !userWantsTop; applyAlwaysOnTop(); if (userWantsTop) startTempGuard(5); return userWantsTop; });
ipcMain.on('win:enter-input', () => { if (!win || win.isDestroyed() || inputMode) return; inputMode = true; try { win.setFocusable(true); win.focus(); } catch (e) {} });
ipcMain.on('win:exit-input', () => { if (!win || win.isDestroyed() || !inputMode) return; inputMode = false; try { win.setFocusable(false); } catch (e) {} });
ipcMain.handle('shortcut:get', () => currentShortcut);
ipcMain.handle('shortcut:set', (e, accel) => registerShortcut(accel));

ipcMain.on('open-note-win', (e, text) => {
  if (noteWin && !noteWin.isDestroyed()) {
    noteWin.focus(); noteWin.webContents.send('note-init', text); return;
  }
  noteWin = new BrowserWindow({
    width: 260, height: 280, frame: false, alwaysOnTop: true, resizable: true,
    backgroundColor: '#fffdf5', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  noteWin.loadFile('index.html', { hash: 'note' });
  noteWin.once('ready-to-show', () => {
    noteWin.webContents.send('note-init', text);
    noteWin.show(); noteWin.focus();
  });
  noteWin.on('closed', () => { noteWin = null; });
});
ipcMain.on('close-note-win', () => { if (noteWin && !noteWin.isDestroyed()) noteWin.close(); });
ipcMain.on('note-changed', (e, text) => { if (win && !win.isDestroyed()) win.webContents.send('note-sync', text); });
ipcMain.on('note-win-enter-input', () => { if (!noteWin || noteWin.isDestroyed()) return; try { noteWin.setFocusable(true); noteWin.focus(); } catch (e) {} });
ipcMain.on('note-win-exit-input', () => { if (!noteWin || noteWin.isDestroyed()) return; try { noteWin.setFocusable(false); } catch (e) {} });

function screenshotDir(folder) {
  const safe = String(folder || 'default').replace(/[\\/:*?"<>|]/g, '_');
  const dir = path.join(app.getPath('pictures'), 'SCRSGTraining', safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function showMainWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  win.show(); if (inputMode) { try { win.setFocusable(true); win.focus(); } catch (e) {} }
  forceTop(); startTempGuard(10);
}

async function triggerCapture(folder) {
  if (captureWin && !captureWin.isDestroyed() && captureWin.isVisible()) return { ok: false, error: '正在截图' };
  if (win) win.hide();
  await new Promise((r) => setTimeout(r, 50));
  try {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const scaleFactor = display.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.bounds.width * scaleFactor), height: Math.round(display.bounds.height * scaleFactor) } });
    let source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    if (!source) { showMainWindow(); return { ok: false, error: '无法获取屏幕' }; }
    const dataURL = source.thumbnail.toDataURL();
    captureData = { dataURL, display, folder: String(folder || 'default') };
    if (!captureWin || captureWin.isDestroyed()) { preCreateCapture(); await new Promise((r) => setTimeout(r, 150)); }
    let wait = 0; while (!captureReady && wait < 800) { await new Promise((r) => setTimeout(r, 50)); wait += 50; }
    try { captureWin.setBounds({ x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height }); } catch (e) {}
    captureWin.webContents.send('screenshot:new-bg', dataURL);
    captureWin.show(); captureWin.focus(); captureWin.setAlwaysOnTop(true, 'screen-saver');
    return { ok: true };
  } catch (err) { showMainWindow(); return { ok: false, error: String(err) }; }
}

ipcMain.handle('screenshot:capture', (e, folder) => triggerCapture(folder));
ipcMain.handle('screenshot:get-bg', () => captureData ? { dataURL: captureData.dataURL } : null);

ipcMain.on('screenshot:region', (e, rect) => {
  if (captureWin && !captureWin.isDestroyed()) captureWin.hide();
  showMainWindow();
  
  if (!captureData) return;
  const { dataURL, folder } = captureData;
  try {
    const img = nativeImage.createFromDataURL(dataURL);
    const imgSize = img.getSize();
    let cx = Math.round(rect.xPct * imgSize.width);
    let cy = Math.round(rect.yPct * imgSize.height);
    let cw = Math.round(rect.wPct * imgSize.width);
    let ch = Math.round(rect.hPct * imgSize.height);
    cx = Math.max(0, Math.min(cx, imgSize.width - 1)); cy = Math.max(0, Math.min(cy, imgSize.height - 1));
    cw = Math.max(1, Math.min(cw, imgSize.width - cx)); ch = Math.max(1, Math.min(ch, imgSize.height - cy));
    
    const cropped = img.crop({ x: cx, y: cy, width: cw, height: ch });
    const dir = screenshotDir(folder);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fname = 'shot-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + '-' + Math.floor(Math.random() * 1000) + '.png';
    const full = path.join(dir, fname);
    fs.writeFileSync(full, cropped.toPNG());
    if (win && !win.isDestroyed()) win.webContents.send('screenshot:saved', { folder, file: fname, fullPath: full });
  } catch (err) { console.error(err); }
  
  setTimeout(() => {
    if (captureWin && !captureWin.isDestroyed()) captureWin.webContents.send('screenshot:clear');
    captureData = null;
  }, 100);
});

ipcMain.on('screenshot:cancel', () => { 
  if (captureWin && !captureWin.isDestroyed()) { 
    captureWin.hide(); 
    setTimeout(() => {
      if (captureWin && !captureWin.isDestroyed()) captureWin.webContents.send('screenshot:clear');
      captureData = null;
    }, 100);
  }
  showMainWindow(); 
});

ipcMain.handle('screenshot:open-folder', async (e, folder) => { try { const dir = screenshotDir(folder); await shell.openPath(dir); startTempGuard(60); setTimeout(forceTop, 150); setTimeout(forceTop, 500); return { ok: true }; } catch (err) { return { ok: false }; } });

ipcMain.handle('screenshot:list', async (e, folder) => {
  try {
    const dir = screenshotDir(folder);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
    files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
    return files.slice(0, 10).map(fname => ({ fname, fullPath: path.join(dir, fname) }));
  } catch (err) { return []; }
});

ipcMain.handle('screenshot:delete', async (e, fullPath) => {
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    return { ok: true };
  } catch (e) { return { ok: false }; }
});