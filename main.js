const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { buildAutoConfigPlan, executeAutoConfigPlan } = require('./lib/auto-config-core');
const {
  readXlsxTable,
  writeXlsxChanges,
  createWorkbookBackup,
} = require('./lib/excel-workbook-adapter');

// ── Config Management ──────────────────────────────────────────────

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const TEAM_CONFIG_PATH = path.join(__dirname, 'team-config.json');

const DEFAULT_CONFIG = {
  p4: {
    port: '',
    user: '',
    client: '',
    depot: '//depot'
  },
  currentStream: '',
  favoriteStreams: [],
  favoriteWorkspaces: [],
  groups: [],
  autoConfigTemplates: [],
  _initialized: false
};

function loadTeamDefaults() {
  try {
    if (fs.existsSync(TEAM_CONFIG_PATH)) {
      const raw = fs.readFileSync(TEAM_CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load team config:', e.message);
  }
  return {};
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const saved = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...saved, p4: { ...DEFAULT_CONFIG.p4, ...(saved.p4 || {}) } };
    }
  } catch (e) {
    console.error('Failed to load config:', e.message);
  }
  const teamDefaults = loadTeamDefaults();
  const merged = {
    ...DEFAULT_CONFIG,
    p4: { ...DEFAULT_CONFIG.p4, ...(teamDefaults.p4 || {}) },
    favoriteStreams: teamDefaults.favoriteStreams || DEFAULT_CONFIG.favoriteStreams,
  };
  return merged;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to save config:', e.message);
    return false;
  }
}

let config = loadConfig();

// ── P4 Command Helpers ─────────────────────────────────────────────

function buildP4Prefix() {
  const parts = ['p4'];
  if (config.p4.port) parts.push(`-p "${config.p4.port}"`);
  if (config.p4.user) parts.push(`-u "${config.p4.user}"`);
  if (config.p4.client) parts.push(`-c "${config.p4.client}"`);
  return parts.join(' ');
}

function runP4(args) {
  return new Promise((resolve, reject) => {
    const cmd = `${buildP4Prefix()} ${args}`;
    exec(cmd, { encoding: 'utf-8', timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        const combined = (stderr || '') + (stdout || '');
        reject(new Error(combined.trim() || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function normalizeRelativePath(inputPath, currentStream) {
  let p = inputPath.replace(/\\/g, '/');
  // If user entered a full depot path like //Torchlight/MainLineWithUGS/design/file.xlsx,
  // strip the stream prefix to get just the relative part
  if (currentStream && p.startsWith(currentStream + '/')) {
    p = p.substring(currentStream.length + 1);
  }
  // Also handle if it starts with // but is a different stream path pattern
  if (p.startsWith('//')) {
    const parts = p.split('/').filter(Boolean);
    // //depot/stream/path/to/file → skip first 2 segments (depot + stream)
    if (parts.length > 2) {
      p = parts.slice(2).join('/');
    }
  }
  // Remove leading slashes
  p = p.replace(/^\/+/, '');
  return p;
}

function relativePathToDepotPath(relativePath) {
  const stream = config.currentStream;
  if (!stream) throw new Error('未选择 Stream');
  const cleaned = normalizeRelativePath(relativePath, stream);
  return `${stream}/${cleaned}`;
}

async function resolveRelativePathToLocal(relativePath) {
  const depotPath = relativePathToDepotPath(relativePath);
  const whereResult = await p4Where(depotPath);
  if (!whereResult.ok) throw new Error(whereResult.error);
  return whereResult.data;
}

async function p4Info() {
  try {
    const output = await runP4('info');
    const info = {};
    for (const line of output.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        info[key] = val;
      }
    }
    return { ok: true, data: info };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function p4Streams(depotPath) {
  try {
    const output = await runP4(`streams "${depotPath}/..."`);
    const streams = [];
    for (const line of output.split('\n')) {
      const match = line.match(/^Stream\s+(\S+)\s+(\S+)\s+\S+\s+'(.*)'/);
      if (match) {
        streams.push({ stream: match[1], type: match[2], name: match[3] });
      }
    }
    return { ok: true, data: streams };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function p4UserWorkspaces() {
  try {
    const user = config.p4.user;
    if (!user) return { ok: false, error: '未配置用户名' };

    const output = await runP4(`-ztag clients -u "${user}"`);
    const workspaces = [];
    let current = {};

    for (const line of output.split('\n')) {
      const m = line.match(/^\.\.\.\s+(\S+)\s+(.*)/);
      if (m) {
        current[m[1]] = m[2].trim();
      } else if (Object.keys(current).length > 0) {
        if (current.client && current.Stream) {
          workspaces.push({
            client: current.client,
            stream: current.Stream,
            streamName: current.Stream.split('/').pop(),
            root: current.Root || ''
          });
        }
        current = {};
      }
    }
    if (current.client && current.Stream) {
      workspaces.push({
        client: current.client,
        stream: current.Stream,
        streamName: current.Stream.split('/').pop(),
        root: current.Root || ''
      });
    }

    return { ok: true, data: workspaces };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function p4SyncFile(depotPath) {
  try {
    const output = await runP4(`sync "${depotPath}"`);
    return { ok: true, data: output };
  } catch (e) {
    if (e.message && (e.message.includes('up-to-date') || e.message.includes('file(s) up-to-date'))) {
      return { ok: true, data: '文件已是最新版本' };
    }
    if (e.message && e.message.includes('no such file')) {
      return { ok: false, error: '文件在当前 Stream 中不存在，请检查路径或切换 Stream' };
    }
    return { ok: false, error: e.message };
  }
}

async function p4Edit(depotPath) {
  try {
    const output = await runP4(`edit "${depotPath}"`);
    return { ok: true, data: output };
  } catch (e) {
    if (e.message && e.message.includes('currently opened')) {
      return { ok: true, data: '文件已处于 Checkout 状态' };
    }
    if (e.message && e.message.includes('not on client')) {
      return { ok: false, error: '文件不在当前工作区映射中' };
    }
    return { ok: false, error: 'Checkout 失败: ' + e.message };
  }
}

async function p4Where(depotPath) {
  try {
    const output = await runP4(`-ztag where "${depotPath}"`);
    const pathMatch = output.match(/^\.\.\.\s+path\s+(.+)$/m);
    if (pathMatch) {
      return { ok: true, data: pathMatch[1].trim() };
    }
    const lines = output.split('\n').filter(l => l.trim());
    const last = lines[lines.length - 1] || '';
    return { ok: true, data: last.trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function p4ClientInfo() {
  try {
    const output = await runP4('client -o');
    const info = {};
    for (const line of output.split('\n')) {
      if (line.startsWith('#') || line.trim() === '') continue;
      const idx = line.indexOf(':');
      if (idx > 0 && !line.startsWith('\t')) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        info[key] = val;
      }
    }
    return { ok: true, data: info };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function p4SwitchStream(streamPath) {
  try {
    const output = await runP4(`client -s -S "${streamPath}"`);
    return { ok: true, data: output };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function p4Fstat(depotPath) {
  try {
    const output = await runP4(`fstat "${depotPath}"`);
    const info = {};
    for (const line of output.split('\n')) {
      const match = line.match(/^\.\.\.\s+(\S+)\s+(.*)/);
      if (match) info[match[1]] = match[2];
    }
    return { ok: true, data: info };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Window Creation ────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 760,
    minHeight: 500,
    title: 'P4 Excel 快捷启动器',
    icon: undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC Handlers ───────────────────────────────────────────────────

ipcMain.handle('p4:info', async () => {
  return await p4Info();
});

ipcMain.handle('p4:streams', async (_event, depotPath) => {
  return await p4Streams(depotPath);
});

ipcMain.handle('p4:workspaces', async () => {
  return await p4UserWorkspaces();
});

ipcMain.handle('p4:switchWorkspace', async (_event, clientName, streamPath) => {
  config.p4.client = clientName;
  config.currentStream = streamPath;
  saveConfig(config);
  return { ok: true };
});

ipcMain.handle('p4:syncAndOpen', async (_event, relativePath, doCheckout) => {
  const stream = config.currentStream;
  if (!stream) return { ok: false, error: '未选择 Stream' };

  const cleaned = normalizeRelativePath(relativePath, stream);
  const depotPath = `${stream}/${cleaned}`;

  const syncResult = await p4SyncFile(depotPath);
  if (!syncResult.ok) return syncResult;

  if (doCheckout) {
    const editResult = await p4Edit(depotPath);
    if (!editResult.ok) return editResult;
  }

  const whereResult = await p4Where(depotPath);
  if (!whereResult.ok) return whereResult;

  const localPath = whereResult.data;
  if (!fs.existsSync(localPath)) {
    return { ok: false, error: `本地文件不存在: ${localPath}` };
  }

  await shell.openPath(localPath);
  return { ok: true, data: { synced: syncResult.data, localPath, checkedOut: !!doCheckout } };
});

ipcMain.handle('p4:fstat', async (_event, relativePath) => {
  const stream = config.currentStream;
  if (!stream) return { ok: false, error: '未选择 Stream' };
  const cleaned = normalizeRelativePath(relativePath, stream);
  const depotPath = `${stream}/${cleaned}`;
  return await p4Fstat(depotPath);
});

ipcMain.handle('p4:clientInfo', async () => {
  return await p4ClientInfo();
});

ipcMain.handle('config:get', () => {
  return JSON.parse(JSON.stringify(config));
});

ipcMain.handle('config:save', (_event, newConfig) => {
  config = {
    ...config,
    ...newConfig,
    p4: { ...config.p4, ...(newConfig.p4 || {}) },
    _initialized: true
  };
  const ok = saveConfig(config);
  return { ok };
});

ipcMain.handle('config:getPath', () => {
  return CONFIG_PATH;
});

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Excel 文件',
    filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile', 'multiSelections']
  });
  return result;
});

ipcMain.handle('p4:detectEnv', async () => {
  const detected = { port: '', user: '', client: '', depot: '' };
  try {
    const output = await new Promise((resolve, reject) => {
      exec('p4 set', { encoding: 'utf-8', timeout: 10000 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
    for (const line of output.split('\n')) {
      const m = line.match(/^(P4PORT)=(.+?)(?:\s+\(.*\))?$/);
      if (m) detected.port = m[2].trim();
      const m2 = line.match(/^(P4USER)=(.+?)(?:\s+\(.*\))?$/);
      if (m2) detected.user = m2[2].trim();
      const m3 = line.match(/^(P4CLIENT)=(.+?)(?:\s+\(.*\))?$/);
      if (m3) detected.client = m3[2].trim();
    }
    return { ok: true, data: detected };
  } catch (e) {
    return { ok: false, error: 'p4 命令未找到，请确认 P4 已安装并添加到系统 PATH 中。\n\n' + e.message };
  }
});

ipcMain.handle('p4:testConnection', async (_event, testConfig) => {
  const lines = [];
  const parts = ['p4'];
  if (testConfig.port) parts.push(`-p "${testConfig.port}"`);
  if (testConfig.user) parts.push(`-u "${testConfig.user}"`);
  if (testConfig.client) parts.push(`-c "${testConfig.client}"`);
  const prefix = parts.join(' ');

  lines.push(`> 执行命令: ${prefix} info\n`);

  try {
    const output = await new Promise((resolve, reject) => {
      exec(`${prefix} info`, { encoding: 'utf-8', timeout: 15000 }, (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || '') + (stdout || '') || err.message));
        else resolve(stdout);
      });
    });
    lines.push(output.trim());
    lines.push('\n--- 连接成功 ---');

    const serverMatch = output.match(/Server address:\s*(.+)/);
    const userMatch = output.match(/User name:\s*(.+)/);
    const clientMatch = output.match(/Client name:\s*(.+)/);
    const rootMatch = output.match(/Client root:\s*(.+)/);

    lines.push(`\nServer: ${serverMatch ? serverMatch[1].trim() : '未知'}`);
    lines.push(`用户: ${userMatch ? userMatch[1].trim() : '未知'}`);
    lines.push(`工作区: ${clientMatch ? clientMatch[1].trim() : '未知'}`);
    lines.push(`本地根目录: ${rootMatch ? rootMatch[1].trim() : '未知'}`);

    if (testConfig.depot) {
      lines.push(`\n> 检查 Streams: ${prefix} streams "${testConfig.depot}/..."`);
      try {
        const sOut = await new Promise((resolve, reject) => {
          exec(`${prefix} streams "${testConfig.depot}/..."`, { encoding: 'utf-8', timeout: 15000 }, (err, stdout, stderr) => {
            if (err) reject(new Error((stderr || '') + (stdout || '') || err.message));
            else resolve(stdout);
          });
        });
        const streamLines = sOut.trim().split('\n').filter(l => l.trim());
        lines.push(`找到 ${streamLines.length} 个 Stream:`);
        streamLines.slice(0, 10).forEach(l => lines.push('  ' + l.trim()));
        if (streamLines.length > 10) lines.push(`  ...还有 ${streamLines.length - 10} 个`);
      } catch (se) {
        lines.push('Streams 查询失败: ' + se.message);
        lines.push('\n可能原因: Depot 路径前缀不正确，请检查是否填写了正确的仓库路径');
      }
    }

    return { ok: true, data: lines.join('\n') };
  } catch (e) {
    lines.push('连接失败!\n');
    lines.push(e.message);
    lines.push('\n--- 常见原因 ---');
    if (e.message.includes('connect')) {
      lines.push('- P4 Server 地址不正确或网络不通');
      lines.push('- 请检查 P4PORT 是否正确（可在 P4V 的 Connection > Environment Settings 中查看）');
    } else if (e.message.includes('password') || e.message.includes('ticket') || e.message.includes('login')) {
      lines.push('- 需要先登录 P4，请在命令行执行: p4 login');
      lines.push('- 或在 P4V 中登录后重试');
    } else if (e.message.includes('not recognized') || e.message.includes('not found')) {
      lines.push('- p4 命令未找到，请确认已安装 Helix Command-Line Client');
      lines.push('- 并将 p4.exe 所在目录添加到系统 PATH 环境变量');
    } else {
      lines.push('- 请确认 P4 Server 地址、用户名、工作区名称是否正确');
      lines.push('- 可以打开 P4V，在 Connection 菜单查看当前连接信息');
    }
    return { ok: false, data: lines.join('\n') };
  }
});

ipcMain.handle('p4:whereReverse', async (_event, localPath) => {
  try {
    const output = await runP4(`-ztag where "${localPath}"`);
    const depotMatch = output.match(/^\.\.\.\s+depotFile\s+(.+)$/m);
    if (depotMatch) {
      return { ok: true, data: depotMatch[1].trim() };
    }
    return { ok: false, error: '无法解析 depot 路径' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Batch Scan Folder ──────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择要批量导入的文件夹',
    properties: ['openDirectory']
  });
  return result;
});

function scanXlsxFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanXlsxFiles(fullPath));
      } else if (/\.xlsx?$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // skip inaccessible directories
  }
  return results;
}

ipcMain.handle('p4:scanFolder', async (_event, folderPath) => {
  try {
    const files = scanXlsxFiles(folderPath);
    if (files.length === 0) {
      return { ok: false, error: '该文件夹下没有找到 .xlsx 文件' };
    }

    const stream = config.currentStream;
    const results = [];

    for (const localFile of files) {
      try {
        const output = await runP4(`-ztag where "${localFile}"`);
        const depotMatch = output.match(/^\.\.\.\s+depotFile\s+(.+)$/m);
        if (depotMatch) {
          let depotPath = depotMatch[1].trim();
          let relativePath = depotPath;
          if (stream && depotPath.startsWith(stream + '/')) {
            relativePath = depotPath.substring(stream.length + 1);
          } else {
            const parts = depotPath.split('/').filter(Boolean);
            if (parts.length > 2) relativePath = parts.slice(2).join('/');
          }
          results.push({
            localPath: localFile,
            depotPath,
            relativePath,
            fileName: path.basename(localFile)
          });
        }
      } catch (e) {
        // file not in depot, skip
      }
    }

    if (results.length === 0) {
      return { ok: false, error: `找到 ${files.length} 个 .xlsx 文件，但它们都不在当前 P4 工作区映射中` };
    }

    return { ok: true, data: results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Export / Import Groups ─────────────────────────────────────

ipcMain.handle('dialog:saveFile', async (_event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出分组配置',
    defaultPath: defaultName || 'p4-groups.json',
    filters: [{ name: 'JSON 配置文件', extensions: ['json'] }]
  });
  return result;
});

ipcMain.handle('config:exportGroups', async (_event, filePath) => {
  try {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      favoriteWorkspaces: config.favoriteWorkspaces || [],
      groups: config.groups || []
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('config:exportRaw', async (_event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('config:importGroups', async () => {
  try {
    const dialogResult = await dialog.showOpenDialog(mainWindow, {
      title: '导入分组配置',
      filters: [{ name: 'JSON 配置文件', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { ok: false, error: 'cancelled' };
    }
    const raw = fs.readFileSync(dialogResult.filePaths[0], 'utf-8');
    const data = JSON.parse(raw);
    if (!data.groups || !Array.isArray(data.groups)) {
      return { ok: false, error: '文件格式不正确：缺少 groups 字段' };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: '读取文件失败: ' + e.message };
  }
});

// ── Auto Config Templates ────────────────────────────────────────

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function ensureTemplateList() {
  if (!Array.isArray(config.autoConfigTemplates)) config.autoConfigTemplates = [];
}

function normalizeTemplateForSave(template) {
  const next = { ...(template || {}) };
  if (!next.id) next.id = `tpl_${Date.now()}`;
  if (!next.name) next.name = next.id;
  if (!Array.isArray(next.inputs)) next.inputs = [];
  if (!Array.isArray(next.idSequences)) next.idSequences = [];
  if (!Array.isArray(next.tables)) next.tables = [];
  next.updatedAt = new Date().toISOString();
  return next;
}

ipcMain.handle('template:list', () => {
  ensureTemplateList();
  return cloneData(config.autoConfigTemplates);
});

ipcMain.handle('template:get', (_event, templateId) => {
  ensureTemplateList();
  const template = config.autoConfigTemplates.find(t => t.id === templateId);
  return template ? cloneData(template) : null;
});

ipcMain.handle('template:save', (_event, template) => {
  try {
    ensureTemplateList();
    const next = normalizeTemplateForSave(template);
    const index = config.autoConfigTemplates.findIndex(t => t.id === next.id);
    if (index >= 0) config.autoConfigTemplates[index] = next;
    else config.autoConfigTemplates.push(next);
    const ok = saveConfig(config);
    return { ok, data: cloneData(next) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('template:delete', (_event, templateId) => {
  ensureTemplateList();
  config.autoConfigTemplates = config.autoConfigTemplates.filter(t => t.id !== templateId);
  return { ok: saveConfig(config) };
});

ipcMain.handle('template:export', async (_event, templateId, filePath) => {
  try {
    ensureTemplateList();
    const templates = templateId
      ? config.autoConfigTemplates.filter(t => t.id === templateId)
      : config.autoConfigTemplates;
    if (templates.length === 0) return { ok: false, error: '没有可导出的模板' };

    let targetPath = filePath;
    if (!targetPath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出自动配表模板',
        defaultPath: templateId ? `${templates[0].name || templates[0].id}.json` : 'auto-config-templates.json',
        filters: [{ name: 'JSON 模板文件', extensions: ['json'] }]
      });
      if (result.canceled) return { ok: false, error: 'cancelled' };
      targetPath = result.filePath;
    }

    const data = { version: 1, exportedAt: new Date().toISOString(), templates };
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf-8');
    return { ok: true, data: { filePath: targetPath } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('template:import', async (_event, filePath) => {
  try {
    let sourcePath = filePath;
    if (!sourcePath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '导入自动配表模板',
        filters: [{ name: 'JSON 模板文件', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: 'cancelled' };
      }
      sourcePath = result.filePaths[0];
    }

    const raw = fs.readFileSync(sourcePath, 'utf-8');
    const data = JSON.parse(raw);
    const importedTemplates = Array.isArray(data) ? data : (data.templates || [data.template]).filter(Boolean);
    if (importedTemplates.length === 0) return { ok: false, error: '模板文件格式不正确' };

    ensureTemplateList();
    const saved = [];
    for (const template of importedTemplates) {
      const next = normalizeTemplateForSave(template);
      const index = config.autoConfigTemplates.findIndex(t => t.id === next.id);
      if (index >= 0) config.autoConfigTemplates[index] = next;
      else config.autoConfigTemplates.push(next);
      saved.push(next);
    }
    saveConfig(config);
    return { ok: true, data: cloneData(saved) };
  } catch (e) {
    return { ok: false, error: '读取模板失败: ' + e.message };
  }
});

async function buildAutoConfigPlanForRequest(runRequest) {
  ensureTemplateList();
  const template = config.autoConfigTemplates.find(t => t.id === runRequest.templateId);
  if (!template) {
    return { ok: false, errors: ['未找到自动配表模板'], warnings: [], changes: [], generatedRows: {} };
  }

  return await buildAutoConfigPlan({
    template,
    runRequest,
    tableReader: async (table, localPath) => await readXlsxTable(localPath, table),
    resolveLocalPath: async (relativePath) => await resolveRelativePathToLocal(relativePath),
  });
}

ipcMain.handle('autoConfig:preview', async (_event, runRequest) => {
  try {
    return await buildAutoConfigPlanForRequest(runRequest || {});
  } catch (e) {
    return { ok: false, errors: [e.message], warnings: [], changes: [], generatedRows: {} };
  }
});

ipcMain.handle('autoConfig:execute', async (_event, runRequest) => {
  try {
    const plan = await buildAutoConfigPlanForRequest(runRequest || {});
    if (!plan.ok) return plan;

    const result = await executeAutoConfigPlan({
      plan,
      p4: {
        sync: async (relativePath) => {
          const syncResult = await p4SyncFile(relativePathToDepotPath(relativePath));
          if (!syncResult.ok) throw new Error(syncResult.error);
        },
        edit: async (relativePath) => {
          const editResult = await p4Edit(relativePathToDepotPath(relativePath));
          if (!editResult.ok) throw new Error(editResult.error);
        },
      },
      backupFile: async (localPath) => await createWorkbookBackup(localPath),
      workbookWriter: async (localPath, changes) => await writeXlsxChanges(localPath, changes),
    });

    return { ok: true, plan, result };
  } catch (e) {
    return { ok: false, errors: [e.message], warnings: [], changes: [], generatedRows: {} };
  }
});
