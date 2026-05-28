const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('p4api', {
  info: () => ipcRenderer.invoke('p4:info'),
  streams: (depotPath) => ipcRenderer.invoke('p4:streams', depotPath),
  workspaces: () => ipcRenderer.invoke('p4:workspaces'),
  switchWorkspace: (clientName, streamPath) => ipcRenderer.invoke('p4:switchWorkspace', clientName, streamPath),
  switchStream: (streamPath) => ipcRenderer.invoke('p4:switchStream', streamPath),
  syncAndOpen: (relativePath, doCheckout) => ipcRenderer.invoke('p4:syncAndOpen', relativePath, doCheckout),
  fstat: (relativePath) => ipcRenderer.invoke('p4:fstat', relativePath),
  clientInfo: () => ipcRenderer.invoke('p4:clientInfo'),
  whereReverse: (localPath) => ipcRenderer.invoke('p4:whereReverse', localPath),
  detectEnv: () => ipcRenderer.invoke('p4:detectEnv'),
  testConnection: (testConfig) => ipcRenderer.invoke('p4:testConnection', testConfig),
  scanFolder: (folderPath) => ipcRenderer.invoke('p4:scanFolder', folderPath)
});

contextBridge.exposeInMainWorld('configApi', {
  get: () => ipcRenderer.invoke('config:get'),
  save: (config) => ipcRenderer.invoke('config:save', config),
  getPath: () => ipcRenderer.invoke('config:getPath'),
  exportGroups: (filePath) => ipcRenderer.invoke('config:exportGroups', filePath),
  importGroups: () => ipcRenderer.invoke('config:importGroups'),
  exportRaw: (filePath, data) => ipcRenderer.invoke('config:exportRaw', filePath, data)
});

contextBridge.exposeInMainWorld('dialogApi', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  saveFile: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName)
});

contextBridge.exposeInMainWorld('templateApi', {
  list: () => ipcRenderer.invoke('template:list'),
  get: (templateId) => ipcRenderer.invoke('template:get', templateId),
  save: (template) => ipcRenderer.invoke('template:save', template),
  delete: (templateId) => ipcRenderer.invoke('template:delete', templateId),
  import: (filePath) => ipcRenderer.invoke('template:import', filePath),
  export: (templateId, filePath) => ipcRenderer.invoke('template:export', templateId, filePath)
});

contextBridge.exposeInMainWorld('autoConfigApi', {
  preview: (runRequest) => ipcRenderer.invoke('autoConfig:preview', runRequest),
  execute: (runRequest) => ipcRenderer.invoke('autoConfig:execute', runRequest)
});

contextBridge.exposeInMainWorld('quickEditApi', {
  templates: () => ipcRenderer.invoke('quickEdit:templates'),
  saveTemplate: (template) => ipcRenderer.invoke('quickEdit:saveTemplate', template),
  deleteTemplate: (templateId) => ipcRenderer.invoke('quickEdit:deleteTemplate', templateId),
  loadRow: (request) => ipcRenderer.invoke('quickEdit:loadRow', request),
  preview: (request) => ipcRenderer.invoke('quickEdit:preview', request),
  execute: (request) => ipcRenderer.invoke('quickEdit:execute', request)
});
