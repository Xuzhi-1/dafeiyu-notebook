const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('moye', {
  openFile: () => ipcRenderer.invoke('file:open'),
  readPath: (filePath) => ipcRenderer.invoke('file:read', filePath),
  save: (filePath, data) => ipcRenderer.invoke('file:save', { filePath, data }),
  saveAs: (data, defaultName) => ipcRenderer.invoke('file:save-as', { data, defaultName }),
  exportDocx: (html, defaultName, pageSize) => ipcRenderer.invoke('file:export-docx', { html, defaultName, pageSize }),
  exportPdf: (defaultName, pageSize) => ipcRenderer.invoke('file:export-pdf', { defaultName, pageSize }),

  info: () => ipcRenderer.invoke('app:info'),
  takeStartupPath: () => ipcRenderer.invoke('app:take-startup-path'),
  rendererReady: () => ipcRenderer.invoke('app:renderer-ready'),
  openFileInNewWindow: (filePath) => ipcRenderer.invoke('file:open-new-window', filePath),
  registerFileAssociation: () => ipcRenderer.invoke('app:register-file-association'),
  mcpStatus: () => ipcRenderer.invoke('mcp:status'),
  mcpEnable: () => ipcRenderer.invoke('mcp:enable'),
  mcpDisable: () => ipcRenderer.invoke('mcp:disable'),
  onMcpCommand: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('mcp:command', listener);
    return () => ipcRenderer.removeListener('mcp:command', listener);
  },
  mcpResult: (payload) => ipcRenderer.send('mcp:result', payload),
  setDirty: (dirty) => ipcRenderer.send('doc:dirty', Boolean(dirty)),
  setDocumentPath: (filePath) => ipcRenderer.send('doc:path', filePath),
  setLocale: (locale) => ipcRenderer.send('locale:set', locale),
  recentList: () => ipcRenderer.invoke('recent:list'),
  recentAdd: (payload) => ipcRenderer.invoke('recent:add', payload),
  importText: () => ipcRenderer.invoke('file:import'),
  pickImage: () => ipcRenderer.invoke('image:pick'),
  readClipboardImage: () => ipcRenderer.invoke('image:clipboard'),
  writeBlockClipboard: (text, html) => ipcRenderer.invoke('clipboard:write-blocks', { text, html }),
  readClipboardHtml: () => ipcRenderer.invoke('clipboard:read-html'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  snapshotClipboard: () => ipcRenderer.invoke('clipboard:snapshot'),
  restoreClipboard: (snapshot) => ipcRenderer.invoke('clipboard:restore', snapshot),
  saveText: (name, content) => ipcRenderer.invoke('file:save-text', { name, content }),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  print: () => ipcRenderer.invoke('doc:print'),

  windowControls: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    state: () => ipcRenderer.invoke('win:state'),
    onMaximized: (callback) => {
      const listener = (_event, value) => callback(Boolean(value));
      ipcRenderer.on('win:maximized', listener);
      return () => ipcRenderer.removeListener('win:maximized', listener);
    },
  },

  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },

  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    openDir: () => ipcRenderer.invoke('plugins:open-dir'),
    remove: (id) => ipcRenderer.invoke('plugins:remove', id),
  },
  onOpenPath: (callback) => {
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on('app:open-path', listener);
    return () => ipcRenderer.removeListener('app:open-path', listener);
  },
});
