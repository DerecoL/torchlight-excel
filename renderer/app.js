(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────

  let config = null;
  let activeGroupIndex = -1;
  let dragFileIndex = -1;
  let dropFileIndex = -1;
  let dropPlacement = null;
  let dragStartedFromInteractiveElement = false;
  let autoTemplates = [];
  let activeAutoTemplateId = '';
  let runItems = [{}];

  // ── DOM References ─────────────────────────────────────────────

  const $statusDot = document.getElementById('statusDot');
  const $statusText = document.getElementById('statusText');
  const $streamSelect = document.getElementById('streamSelect');
  const $btnRefreshStreams = document.getElementById('btnRefreshStreams');
  const $btnSettings = document.getElementById('btnSettings');
  const $btnAddGroup = document.getElementById('btnAddGroup');
  const $groupList = document.getElementById('groupList');
  const $currentGroupTitle = document.getElementById('currentGroupTitle');
  const $btnAddFile = document.getElementById('btnAddFile');
  const $fileList = document.getElementById('fileList');
  const $toast = document.getElementById('toast');
  const $mainContainer = document.querySelector('.main-container');
  const $btnAutoConfig = document.getElementById('btnAutoConfig');
  const $autoConfigShell = document.getElementById('autoConfigShell');
  const $btnBackToFavorites = document.getElementById('btnBackToFavorites');
  const $templateList = document.getElementById('templateList');
  const $btnNewTemplate = document.getElementById('btnNewTemplate');
  const $btnImportTemplate = document.getElementById('btnImportTemplate');
  const $btnExportTemplate = document.getElementById('btnExportTemplate');
  const $btnTemplateTab = document.getElementById('btnTemplateTab');
  const $btnRunTab = document.getElementById('btnRunTab');
  const $templatePanel = document.getElementById('templatePanel');
  const $runPanel = document.getElementById('runPanel');
  const $templateNameInput = document.getElementById('templateNameInput');
  const $templateIdInput = document.getElementById('templateIdInput');
  const $templateFullJsonText = document.getElementById('templateFullJsonText');
  const $templateInputsText = document.getElementById('templateInputsText');
  const $templateIdsText = document.getElementById('templateIdsText');
  const $templateTablesText = document.getElementById('templateTablesText');
  const $btnFullJsonToEditor = document.getElementById('btnFullJsonToEditor');
  const $btnVisualToJson = document.getElementById('btnVisualToJson');
  const $btnJsonToVisual = document.getElementById('btnJsonToVisual');
  const $visualInputsList = document.getElementById('visualInputsList');
  const $visualIdsList = document.getElementById('visualIdsList');
  const $visualTablesList = document.getElementById('visualTablesList');
  const $btnAddVisualInput = document.getElementById('btnAddVisualInput');
  const $btnAddVisualId = document.getElementById('btnAddVisualId');
  const $btnAddVisualTable = document.getElementById('btnAddVisualTable');
  const $btnSaveTemplate = document.getElementById('btnSaveTemplate');
  const $btnDeleteTemplate = document.getElementById('btnDeleteTemplate');
  const $runTemplateSelect = document.getElementById('runTemplateSelect');
  const $runJsonText = document.getElementById('runJsonText');
  const $runJsonStatus = document.getElementById('runJsonStatus');
  const $btnLoadRunJson = document.getElementById('btnLoadRunJson');
  const $btnDumpRunJson = document.getElementById('btnDumpRunJson');
  const $runInputFields = document.getElementById('runInputFields');
  const $runItemsTable = document.getElementById('runItemsTable');
  const $btnAddRunItem = document.getElementById('btnAddRunItem');
  const $runIdFields = document.getElementById('runIdFields');
  const $btnPreviewAutoConfig = document.getElementById('btnPreviewAutoConfig');
  const $btnExecuteAutoConfig = document.getElementById('btnExecuteAutoConfig');
  const $autoPreviewOutput = document.getElementById('autoPreviewOutput');

  // Modals
  const $modalAddGroup = document.getElementById('modalAddGroup');
  const $inputGroupName = document.getElementById('inputGroupName');
  const $btnConfirmAddGroup = document.getElementById('btnConfirmAddGroup');

  const $modalAddFile = document.getElementById('modalAddFile');
  const $inputFilePath = document.getElementById('inputFilePath');
  const $inputBrowsePath = document.getElementById('inputBrowsePath');
  const $inputFileAlias = document.getElementById('inputFileAlias');
  const $btnBrowseFile = document.getElementById('btnBrowseFile');
  const $btnConfirmAddFile = document.getElementById('btnConfirmAddFile');
  const $manualPathGroup = document.getElementById('manualPathGroup');
  const $browsePathGroup = document.getElementById('browsePathGroup');

  const $modalSettings = document.getElementById('modalSettings');
  const $settingPort = document.getElementById('settingPort');
  const $settingUser = document.getElementById('settingUser');
  const $settingClient = document.getElementById('settingClient');
  const $settingDepot = document.getElementById('settingDepot');
  const $btnSaveSettings = document.getElementById('btnSaveSettings');

  const $modalRenameGroup = document.getElementById('modalRenameGroup');
  const $inputRenameGroup = document.getElementById('inputRenameGroup');
  const $btnConfirmRenameGroup = document.getElementById('btnConfirmRenameGroup');

  // ── Toast ──────────────────────────────────────────────────────

  let toastTimer = null;

  function showToast(message, type = 'info', duration = 3000) {
    clearTimeout(toastTimer);
    $toast.textContent = message;
    $toast.className = `toast ${type}`;
    toastTimer = setTimeout(() => {
      $toast.classList.add('hidden');
    }, duration);
  }

  // ── Modal Helpers ──────────────────────────────────────────────

  function openModal(el) {
    el.classList.remove('hidden');
    const firstInput = el.querySelector('input:not([readonly])');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function closeModal(el) {
    el.classList.add('hidden');
  }

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.close);
      if (modal) closeModal(modal);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  // ── P4 Connection Check ────────────────────────────────────────

  async function checkP4Connection() {
    $statusDot.className = 'status-dot disconnected';
    $statusText.textContent = '检测中...';

    const result = await window.p4api.info();
    if (result.ok) {
      $statusDot.className = 'status-dot connected';
      const user = result.data['User name'] || '';
      const client = result.data['Client name'] || '';
      $statusText.textContent = `${user} @ ${client}`;

      if (!config.p4.user && user) config.p4.user = user;
      if (!config.p4.client && client) config.p4.client = client;

      return true;
    } else {
      $statusDot.className = 'status-dot disconnected';
      $statusText.textContent = '未连接';
      showToast('P4 连接失败: ' + result.error, 'error', 5000);
      return false;
    }
  }

  // ── Workspaces (每个工作区对应一个 Stream) ─────────────────────

  const $btnStarStream = document.getElementById('btnStarStream');
  let allWorkspaces = [];

  function isWorkspaceFavorited(clientName) {
    return (config.favoriteWorkspaces || []).includes(clientName);
  }

  function updateStarButton() {
    const current = $streamSelect.value;
    if (current && isWorkspaceFavorited(current)) {
      $btnStarStream.textContent = '★';
      $btnStarStream.classList.add('starred');
      $btnStarStream.title = '取消收藏此工作区';
    } else {
      $btnStarStream.textContent = '☆';
      $btnStarStream.classList.remove('starred');
      $btnStarStream.title = '收藏此工作区';
    }
  }

  function renderWorkspaceSelect() {
    $streamSelect.innerHTML = '';
    if (!config.favoriteWorkspaces) config.favoriteWorkspaces = [];

    const favs = allWorkspaces.filter(w => config.favoriteWorkspaces.includes(w.client));
    const others = allWorkspaces.filter(w => !config.favoriteWorkspaces.includes(w.client));

    if (favs.length > 0) {
      const grpFav = document.createElement('optgroup');
      grpFav.label = '★ 常用';
      favs.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.client;
        opt.textContent = `${w.client} (${w.streamName})`;
        grpFav.appendChild(opt);
      });
      $streamSelect.appendChild(grpFav);
    }

    if (others.length > 0) {
      const grpAll = document.createElement('optgroup');
      grpAll.label = favs.length > 0 ? '── 全部 ──' : '全部工作区';
      others.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.client;
        opt.textContent = `${w.client} (${w.streamName})`;
        grpAll.appendChild(opt);
      });
      $streamSelect.appendChild(grpAll);
    }

    const currentClient = config.p4.client;
    if (currentClient) {
      $streamSelect.value = currentClient;
    }
    if (!$streamSelect.value && allWorkspaces.length > 0) {
      const first = favs.length > 0 ? favs[0] : allWorkspaces[0];
      $streamSelect.value = first.client;
      config.p4.client = first.client;
      config.currentStream = first.stream;
      window.configApi.save(config);
    }

    updateStarButton();
  }

  async function loadWorkspaces() {
    $streamSelect.disabled = true;
    $streamSelect.innerHTML = '<option value="">加载中...</option>';

    const result = await window.p4api.workspaces();

    if (result.ok && result.data.length > 0) {
      allWorkspaces = result.data;
      renderWorkspaceSelect();
      $streamSelect.disabled = false;

      const currentClient = config.p4.client;
      const matched = allWorkspaces.find(w => w.client === currentClient);
      if (matched) {
        config.currentStream = matched.stream;
        window.configApi.save(config);
      }
    } else {
      allWorkspaces = [];
      $streamSelect.innerHTML = '<option value="">无可用工作区</option>';
      if (!result.ok) {
        showToast('获取工作区列表失败: ' + result.error, 'error', 6000);
      } else {
        showToast('未找到关联 Stream 的工作区，请检查 P4 配置', 'error', 6000);
      }
    }
  }

  $btnStarStream.addEventListener('click', async () => {
    const current = $streamSelect.value;
    if (!current) return;

    if (!config.favoriteWorkspaces) config.favoriteWorkspaces = [];

    const idx = config.favoriteWorkspaces.indexOf(current);
    if (idx >= 0) {
      config.favoriteWorkspaces.splice(idx, 1);
      showToast('已取消收藏', 'info');
    } else {
      config.favoriteWorkspaces.push(current);
      showToast(`已收藏「${current}」`, 'success');
    }

    await window.configApi.save(config);
    renderWorkspaceSelect();
    $streamSelect.value = current;
    updateStarButton();
  });

  $streamSelect.addEventListener('change', async () => {
    const clientName = $streamSelect.value;
    if (!clientName) return;

    const ws = allWorkspaces.find(w => w.client === clientName);
    if (!ws) return;

    updateStarButton();
    $streamSelect.disabled = true;
    showToast(`正在切换到工作区 ${clientName}...`, 'info');

    const result = await window.p4api.switchWorkspace(clientName, ws.stream);
    if (result.ok) {
      config.p4.client = clientName;
      config.currentStream = ws.stream;
      $statusText.textContent = `${config.p4.user} @ ${clientName}`;
      showToast(`已切换到 ${clientName} (${ws.streamName})`, 'success');
    } else {
      showToast('切换失败: ' + result.error, 'error');
    }
    $streamSelect.disabled = false;
  });

  $btnRefreshStreams.addEventListener('click', () => {
    loadWorkspaces();
  });

  // ── Groups ─────────────────────────────────────────────────────

  function renderGroups() {
    $groupList.innerHTML = '';

    if (!config.groups || config.groups.length === 0) {
      const li = document.createElement('li');
      li.style.cssText = 'padding: 20px 14px; color: var(--text-muted); font-size: 12px; text-align: center;';
      li.textContent = '暂无分组，点击 + 创建';
      $groupList.appendChild(li);
      return;
    }

    config.groups.forEach((group, index) => {
      const li = document.createElement('li');
      li.className = 'group-item' + (index === activeGroupIndex ? ' active' : '');
      li.innerHTML = `
        <span class="group-item-name">${escapeHtml(group.name)}</span>
        <span class="group-item-count">${group.files.length}</span>
        <div class="group-item-actions">
          <button class="group-action-btn" data-action="share" data-index="${index}" title="分享此分组">↑</button>
          <button class="group-action-btn" data-action="rename" data-index="${index}" title="重命名">✎</button>
          <button class="group-action-btn" data-action="delete" data-index="${index}" title="删除">✕</button>
        </div>
      `;

      li.addEventListener('click', (e) => {
        if (e.target.closest('.group-action-btn')) return;
        selectGroup(index);
      });

      $groupList.appendChild(li);
    });

    $groupList.querySelectorAll('.group-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const index = parseInt(btn.dataset.index);
        if (action === 'rename') startRenameGroup(index);
        else if (action === 'delete') deleteGroup(index);
        else if (action === 'share') shareGroup(index);
      });
    });
  }

  const $btnBatchImport = document.getElementById('btnBatchImport');

  function selectGroup(index) {
    activeGroupIndex = index;
    renderGroups();
    renderFiles();
    $btnAddFile.disabled = false;
    $btnBatchImport.disabled = false;
  }

  // ── Add Group ──────────────────────────────────────────────────

  $btnAddGroup.addEventListener('click', () => {
    $inputGroupName.value = '';
    openModal($modalAddGroup);
  });

  $btnConfirmAddGroup.addEventListener('click', async () => {
    const name = $inputGroupName.value.trim();
    if (!name) {
      showToast('请输入分组名称', 'error');
      return;
    }

    config.groups.push({ name, files: [] });
    await window.configApi.save(config);
    closeModal($modalAddGroup);
    selectGroup(config.groups.length - 1);
    showToast(`分组「${name}」已创建`, 'success');
  });

  $inputGroupName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $btnConfirmAddGroup.click();
  });

  // ── Rename Group ───────────────────────────────────────────────

  let renameGroupIndex = -1;

  function startRenameGroup(index) {
    renameGroupIndex = index;
    $inputRenameGroup.value = config.groups[index].name;
    openModal($modalRenameGroup);
  }

  $btnConfirmRenameGroup.addEventListener('click', async () => {
    const name = $inputRenameGroup.value.trim();
    if (!name) {
      showToast('请输入分组名称', 'error');
      return;
    }
    config.groups[renameGroupIndex].name = name;
    await window.configApi.save(config);
    closeModal($modalRenameGroup);
    renderGroups();
    if (activeGroupIndex === renameGroupIndex) {
      $currentGroupTitle.textContent = name;
    }
    showToast('分组已重命名', 'success');
  });

  $inputRenameGroup.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $btnConfirmRenameGroup.click();
  });

  // ── Delete Group ───────────────────────────────────────────────

  async function deleteGroup(index) {
    const group = config.groups[index];
    if (!confirm(`确定删除分组「${group.name}」吗？\n包含 ${group.files.length} 个文件收藏。`)) return;

    config.groups.splice(index, 1);
    await window.configApi.save(config);

    if (activeGroupIndex === index) {
      activeGroupIndex = -1;
      $currentGroupTitle.textContent = '选择一个分组';
      $btnAddFile.disabled = true;
      $fileList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p>选择左侧分组查看文件，或创建一个新分组开始使用</p>
        </div>`;
    } else if (activeGroupIndex > index) {
      activeGroupIndex--;
    }

    renderGroups();
    showToast('分组已删除', 'success');
  }

  // ── Files ──────────────────────────────────────────────────────

  function clearFileDragState() {
    dragFileIndex = -1;
    dropFileIndex = -1;
    dropPlacement = null;
  }

  function clearCurrentDropTarget() {
    dropFileIndex = -1;
    dropPlacement = null;
  }

  function updateDropIndicator(card, placement) {
    card.classList.toggle('drop-before', placement === 'before');
    card.classList.toggle('drop-after', placement === 'after');
  }

  function clearDropIndicators() {
    $fileList.querySelectorAll('.file-card').forEach(card => {
      card.classList.remove('dragging', 'drop-before', 'drop-after');
    });
  }

  function restoreDraggingCardState() {
    if (dragFileIndex < 0) return;
    const draggingCard = $fileList.querySelector(`[data-file-index="${dragFileIndex}"]`);
    if (draggingCard) draggingCard.classList.add('dragging');
  }

  $fileList.addEventListener('dragover', (event) => {
    if (dragFileIndex < 0) return;
    const hoveredCard =
      event.target instanceof Element ? event.target.closest('.file-card') : null;
    if (hoveredCard) return;

    event.preventDefault();
    clearCurrentDropTarget();
    clearDropIndicators();
    restoreDraggingCardState();
  });

  function renderFiles() {
    if (activeGroupIndex < 0 || !config.groups[activeGroupIndex]) {
      $fileList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <p>选择左侧分组查看文件，或创建一个新分组开始使用</p>
        </div>`;
      $currentGroupTitle.textContent = '选择一个分组';
      return;
    }

    const group = config.groups[activeGroupIndex];
    $currentGroupTitle.textContent = group.name;

    if (group.files.length === 0) {
      $fileList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <p>当前分组暂无文件，点击「+ 添加文件」收藏表格</p>
        </div>`;
      return;
    }

    $fileList.innerHTML = '';
    let needsSave = false;
    group.files.forEach((file, fileIndex) => {
      const cleaned = cleanRelativePath(file.relativePath);
      if (cleaned !== file.relativePath) {
        file.relativePath = cleaned;
        needsSave = true;
      }
      const card = document.createElement('div');
      card.className = 'file-card';
      card.draggable = group.files.length > 1;
      card.dataset.fileIndex = String(fileIndex);
      const displayName = file.alias || getFileName(file.relativePath);
      card.innerHTML = `
        <div class="file-icon">📊</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(displayName)}</div>
          <div class="file-path">${escapeHtml(file.relativePath)}</div>
        </div>
        <div class="file-actions">
          <button class="btn-open btn-checkout" data-file-index="${fileIndex}" data-checkout="true">
            <span class="spinner"></span>
            <span class="btn-open-text">Checkout 并打开</span>
          </button>
          <button class="btn-open btn-view" data-file-index="${fileIndex}" data-checkout="false" title="仅同步到最新并打开（只读）">
            <span class="spinner"></span>
            <span class="btn-open-text">仅查看</span>
          </button>
          <button class="btn-remove" data-file-index="${fileIndex}" title="移除收藏">✕</button>
        </div>
      `;

      card.addEventListener('pointerdown', (event) => {
        dragStartedFromInteractiveElement =
          event.target instanceof Element &&
          !!event.target.closest('button, a, input, select, textarea, .file-actions');
      }, true);

      card.addEventListener('dragstart', (event) => {
        if (dragStartedFromInteractiveElement) {
          event.preventDefault();
          return;
        }
        dragFileIndex = fileIndex;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(fileIndex));
      });

      card.addEventListener('dragover', (event) => {
        if (dragFileIndex < 0 || dragFileIndex === fileIndex) return;
        event.preventDefault();

        const rect = card.getBoundingClientRect();
        dropFileIndex = fileIndex;
        dropPlacement = window.fileDragSort.getDropPlacement(event.clientY, rect.top, rect.height);

        clearDropIndicators();
        restoreDraggingCardState();
        updateDropIndicator(card, dropPlacement);
      });

      card.addEventListener('drop', async (event) => {
        event.preventDefault();
        const currentGroup = config.groups[activeGroupIndex];
        if (!currentGroup || dragFileIndex < 0 || dropFileIndex < 0 || !dropPlacement) return;

        const reordered = window.fileDragSort.reorderFilesForDrop(currentGroup.files, dragFileIndex, dropFileIndex, dropPlacement);
        const unchanged = reordered.every((item, index) => item === currentGroup.files[index]);
        clearFileDragState();
        clearDropIndicators();
        if (unchanged) return;

        currentGroup.files = reordered;
        await window.configApi.save(config);
        dragStartedFromInteractiveElement = false;
        renderFiles();
        renderGroups();
      });

      card.addEventListener('dragend', () => {
        dragStartedFromInteractiveElement = false;
        clearFileDragState();
        clearDropIndicators();
      });

      $fileList.appendChild(card);
    });

    if (needsSave) window.configApi.save(config);

    $fileList.querySelectorAll('.btn-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.fileIndex);
        const doCheckout = btn.dataset.checkout === 'true';
        syncAndOpenFile(idx, btn, doCheckout);
      });
    });

    $fileList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.fileIndex);
        removeFile(idx);
      });
    });
  }

  async function syncAndOpenFile(fileIndex, btnEl, doCheckout = true) {
    const group = config.groups[activeGroupIndex];
    if (!group || !group.files[fileIndex]) return;

    const file = group.files[fileIndex];
    btnEl.classList.add('loading');
    btnEl.disabled = true;

    const action = doCheckout ? '同步并 Checkout' : '同步';
    showToast(`正在${action}: ${file.relativePath}`, 'info');

    const result = await window.p4api.syncAndOpen(file.relativePath, doCheckout);

    btnEl.classList.remove('loading');
    btnEl.disabled = false;

    if (result.ok) {
      const msg = doCheckout
        ? `已 Checkout 并打开: ${getFileName(file.relativePath)}`
        : `已同步并打开（只读）: ${getFileName(file.relativePath)}`;
      showToast(msg, 'success');
    } else {
      showToast('操作失败: ' + result.error, 'error', 5000);
    }
  }

  async function removeFile(fileIndex) {
    const group = config.groups[activeGroupIndex];
    if (!group) return;
    const file = group.files[fileIndex];
    const name = file.alias || getFileName(file.relativePath);

    if (!confirm(`确定移除「${name}」吗？`)) return;

    group.files.splice(fileIndex, 1);
    await window.configApi.save(config);
    renderFiles();
    renderGroups();
    showToast('已移除', 'success');
  }

  // ── Add File ───────────────────────────────────────────────────

  $btnAddFile.addEventListener('click', () => {
    $inputFilePath.value = '';
    $inputBrowsePath.value = '';
    $inputFileAlias.value = '';
    document.querySelector('input[name="addFileMode"][value="manual"]').checked = true;
    $manualPathGroup.classList.remove('hidden');
    $browsePathGroup.classList.add('hidden');
    openModal($modalAddFile);
  });

  document.querySelectorAll('input[name="addFileMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'manual') {
        $manualPathGroup.classList.remove('hidden');
        $browsePathGroup.classList.add('hidden');
      } else {
        $manualPathGroup.classList.add('hidden');
        $browsePathGroup.classList.remove('hidden');
      }
    });
  });

  $btnBrowseFile.addEventListener('click', async () => {
    const result = await window.dialogApi.openFile();
    if (!result.canceled && result.filePaths.length > 0) {
      $inputBrowsePath.value = result.filePaths[0];

      const whereResult = await window.p4api.whereReverse(result.filePaths[0]);
      if (whereResult.ok) {
        const depotPath = whereResult.data;
        const stream = config.currentStream;
        if (stream && depotPath.startsWith(stream + '/')) {
          const relative = depotPath.substring(stream.length + 1);
          $inputBrowsePath.dataset.relativePath = relative;
        } else {
          $inputBrowsePath.dataset.relativePath = depotPath;
        }
      }
    }
  });

  function cleanRelativePath(inputPath) {
    let p = inputPath.replace(/\\/g, '/');
    const stream = config.currentStream;
    if (stream && p.startsWith(stream + '/')) {
      p = p.substring(stream.length + 1);
    }
    if (p.startsWith('//')) {
      const parts = p.split('/').filter(Boolean);
      if (parts.length > 2) {
        p = parts.slice(2).join('/');
      }
    }
    p = p.replace(/^\/+/, '');
    return p;
  }

  $btnConfirmAddFile.addEventListener('click', async () => {
    const mode = document.querySelector('input[name="addFileMode"]:checked').value;
    let relativePath = '';

    if (mode === 'manual') {
      relativePath = cleanRelativePath($inputFilePath.value.trim());
    } else {
      relativePath = $inputBrowsePath.dataset.relativePath || '';
      if (relativePath) relativePath = cleanRelativePath(relativePath);
    }

    if (!relativePath) {
      showToast('请输入或选择文件路径', 'error');
      return;
    }

    const alias = $inputFileAlias.value.trim();
    const group = config.groups[activeGroupIndex];

    const exists = group.files.some(f => f.relativePath === relativePath);
    if (exists) {
      showToast('该文件已在当前分组中', 'error');
      return;
    }

    group.files.push({ relativePath, alias });
    await window.configApi.save(config);
    closeModal($modalAddFile);
    renderFiles();
    renderGroups();
    showToast('文件已添加', 'success');
  });

  // ── Settings ───────────────────────────────────────────────────

  const $btnDetectP4 = document.getElementById('btnDetectP4');
  const $btnTestConnection = document.getElementById('btnTestConnection');
  const $diagOutputGroup = document.getElementById('diagOutputGroup');
  const $diagOutput = document.getElementById('diagOutput');

  function showDiag(text, isSuccess) {
    $diagOutputGroup.classList.remove('hidden');
    $diagOutput.textContent = text;
    $diagOutput.className = 'diag-output' + (isSuccess ? ' diag-success' : ' diag-error');
    $diagOutput.scrollTop = 0;
  }

  $btnSettings.addEventListener('click', () => {
    $settingPort.value = config.p4.port || '';
    $settingUser.value = config.p4.user || '';
    $settingClient.value = config.p4.client || '';
    $settingDepot.value = config.p4.depot || '';
    $diagOutputGroup.classList.add('hidden');
    openModal($modalSettings);
  });

  $btnDetectP4.addEventListener('click', async () => {
    $btnDetectP4.disabled = true;
    $btnDetectP4.textContent = '检测中...';

    const result = await window.p4api.detectEnv();

    if (result.ok) {
      const d = result.data;
      if (d.port) $settingPort.value = d.port;
      if (d.user) $settingUser.value = d.user;
      if (d.client) $settingClient.value = d.client;

      const filled = [d.port && 'Server', d.user && '用户名', d.client && '工作区'].filter(Boolean);
      if (filled.length > 0) {
        showDiag(`已自动检测到以下配置：\n\n` +
          `P4PORT  = ${d.port || '(未设置)'}\n` +
          `P4USER  = ${d.user || '(未设置)'}\n` +
          `P4CLIENT = ${d.client || '(未设置)'}\n\n` +
          `已填入 ${filled.join('、')}。\n` +
          `「Depot 路径前缀」需要手动填写（即你项目 Streams 的根路径，如 //GameProject）。\n\n` +
          `填完后可点击「测试连接」验证是否正确。`, true);
      } else {
        showDiag(`未从系统环境中检测到 P4 配置。\n\n` +
          `请手动填写，各项信息可在 P4V 中查看：\n` +
          `- 打开 P4V\n` +
          `- 查看左上角的 Server 地址 → 填入 P4 Server\n` +
          `- 查看左上角的 User → 填入用户名\n` +
          `- 查看左上角的 Workspace → 填入工作区\n` +
          `- 在 Depot 树中找到你项目的根路径 → 填入 Depot 路径前缀`, false);
      }
    } else {
      showDiag(result.error, false);
    }

    $btnDetectP4.disabled = false;
    $btnDetectP4.textContent = '🔍 自动检测';
  });

  $btnTestConnection.addEventListener('click', async () => {
    $btnTestConnection.disabled = true;
    $btnTestConnection.textContent = '测试中...';

    const testConfig = {
      port: $settingPort.value.trim(),
      user: $settingUser.value.trim(),
      client: $settingClient.value.trim(),
      depot: $settingDepot.value.trim()
    };

    const result = await window.p4api.testConnection(testConfig);
    showDiag(result.data, result.ok);

    $btnTestConnection.disabled = false;
    $btnTestConnection.textContent = '🔗 测试连接';
  });

  $btnSaveSettings.addEventListener('click', async () => {
    config.p4.port = $settingPort.value.trim();
    config.p4.user = $settingUser.value.trim();
    config.p4.client = $settingClient.value.trim();
    config.p4.depot = $settingDepot.value.trim() || '//depot';

    await window.configApi.save(config);
    closeModal($modalSettings);
    showToast('设置已保存，正在重新连接...', 'info');

    await checkP4Connection();
    await loadWorkspaces();
  });

  // ── Batch Import Folder ────────────────────────────────────────

  const $modalBatchImport = document.getElementById('modalBatchImport');
  const $batchInfo = document.getElementById('batchInfo');
  const $batchFileList = document.getElementById('batchFileList');
  const $btnConfirmBatchImport = document.getElementById('btnConfirmBatchImport');
  let batchScanResults = [];

  $btnBatchImport.addEventListener('click', async () => {
    if (activeGroupIndex < 0) return;

    const result = await window.dialogApi.openFolder();
    if (result.canceled || result.filePaths.length === 0) return;

    $btnBatchImport.disabled = true;
    $btnBatchImport.textContent = '扫描中...';
    showToast('正在扫描文件夹并解析 P4 路径...', 'info', 10000);

    const scanResult = await window.p4api.scanFolder(result.filePaths[0]);

    $btnBatchImport.disabled = false;
    $btnBatchImport.textContent = '批量导入文件夹';

    if (!scanResult.ok) {
      showToast(scanResult.error, 'error', 5000);
      return;
    }

    batchScanResults = scanResult.data;
    const group = config.groups[activeGroupIndex];
    const existingPaths = new Set(group.files.map(f => f.relativePath));
    const newFiles = batchScanResults.filter(f => !existingPaths.has(f.relativePath));

    $batchInfo.textContent = `找到 ${batchScanResults.length} 个文件，其中 ${newFiles.length} 个为新文件（已排除重复）`;

    $batchFileList.innerHTML = '';
    newFiles.forEach((file, i) => {
      const item = document.createElement('div');
      item.className = 'batch-file-item';
      item.innerHTML = `
        <input type="checkbox" checked data-batch-index="${i}">
        <span class="batch-file-name">${escapeHtml(file.fileName)}</span>
        <span class="batch-file-path">${escapeHtml(file.relativePath)}</span>
      `;
      $batchFileList.appendChild(item);
    });

    if (newFiles.length === 0) {
      showToast('所有文件已在当前分组中，无需添加', 'info');
      return;
    }

    batchScanResults = newFiles;
    openModal($modalBatchImport);
  });

  $btnConfirmBatchImport.addEventListener('click', async () => {
    const group = config.groups[activeGroupIndex];
    const checkboxes = $batchFileList.querySelectorAll('input[type="checkbox"]:checked');
    let addedCount = 0;

    checkboxes.forEach(cb => {
      const idx = parseInt(cb.dataset.batchIndex);
      const file = batchScanResults[idx];
      if (file) {
        group.files.push({ relativePath: file.relativePath, alias: '' });
        addedCount++;
      }
    });

    await window.configApi.save(config);
    closeModal($modalBatchImport);
    renderFiles();
    renderGroups();
    showToast(`已添加 ${addedCount} 个文件到「${group.name}」`, 'success');
  });

  // ── Share Single Group ─────────────────────────────────────────

  async function shareGroup(index) {
    const group = config.groups[index];
    if (!group) return;

    const result = await window.dialogApi.saveFile(`${group.name}.json`);
    if (result.canceled) return;

    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      favoriteStreams: [],
      groups: [group]
    };

    const exportResult = await window.configApi.exportRaw(result.filePath, data);
    if (exportResult.ok) {
      showToast(`分组「${group.name}」已导出，可分享给同事`, 'success');
    } else {
      showToast('导出失败: ' + exportResult.error, 'error');
    }
  }

  // ── Export / Import Groups ────────────────────────────────────

  const $btnExportGroups = document.getElementById('btnExportGroups');
  const $btnImportGroups = document.getElementById('btnImportGroups');
  const $modalImportConfirm = document.getElementById('modalImportConfirm');
  const $importPreviewText = document.getElementById('importPreviewText');
  const $btnImportMerge = document.getElementById('btnImportMerge');
  const $btnImportReplace = document.getElementById('btnImportReplace');
  let pendingImportData = null;

  $btnExportGroups.addEventListener('click', async () => {
    if (!config.groups || config.groups.length === 0) {
      showToast('当前没有分组可导出', 'error');
      return;
    }

    const result = await window.dialogApi.saveFile('p4-groups.json');
    if (result.canceled) return;

    const exportResult = await window.configApi.exportGroups(result.filePath);
    if (exportResult.ok) {
      showToast('分组配置已导出，可分享给同事', 'success');
    } else {
      showToast('导出失败: ' + exportResult.error, 'error');
    }
  });

  $btnImportGroups.addEventListener('click', async () => {
    const result = await window.configApi.importGroups();
    if (!result.ok) {
      if (result.error !== 'cancelled') showToast('导入失败: ' + result.error, 'error');
      return;
    }

    pendingImportData = result.data;
    const groupCount = pendingImportData.groups.length;
    const fileCount = pendingImportData.groups.reduce((sum, g) => sum + g.files.length, 0);
    const wsCount = (pendingImportData.favoriteWorkspaces || []).length;

    let preview = `即将导入 ${groupCount} 个分组（共 ${fileCount} 个文件）`;
    if (wsCount > 0) preview += `，${wsCount} 个收藏工作区`;
    preview += '。\n\n请选择导入方式：';
    $importPreviewText.textContent = preview;

    openModal($modalImportConfirm);
  });

  $btnImportMerge.addEventListener('click', async () => {
    if (!pendingImportData) return;

    for (const importGroup of pendingImportData.groups) {
      const existing = config.groups.find(g => g.name === importGroup.name);
      if (existing) {
        const existingPaths = new Set(existing.files.map(f => f.relativePath));
        for (const file of importGroup.files) {
          if (!existingPaths.has(file.relativePath)) {
            existing.files.push(file);
          }
        }
      } else {
        config.groups.push(importGroup);
      }
    }

    const importFavWs = pendingImportData.favoriteWorkspaces || [];
    if (importFavWs.length > 0) {
      if (!config.favoriteWorkspaces) config.favoriteWorkspaces = [];
      const set = new Set(config.favoriteWorkspaces);
      for (const s of importFavWs) set.add(s);
      config.favoriteWorkspaces = [...set];
    }

    await window.configApi.save(config);
    closeModal($modalImportConfirm);
    renderGroups();
    renderFiles();
    if (allWorkspaces.length > 0) renderWorkspaceSelect();
    showToast('分组已合并导入', 'success');
  });

  $btnImportReplace.addEventListener('click', async () => {
    if (!pendingImportData) return;

    config.groups = pendingImportData.groups;

    if (pendingImportData.favoriteWorkspaces) {
      config.favoriteWorkspaces = pendingImportData.favoriteWorkspaces;
    }

    activeGroupIndex = -1;
    await window.configApi.save(config);
    closeModal($modalImportConfirm);
    renderGroups();
    renderFiles();
    $btnAddFile.disabled = true;
    $btnBatchImport.disabled = true;
    if (allWorkspaces.length > 0) renderWorkspaceSelect();
    showToast('分组已替换导入', 'success');
  });

  // ── Auto Config Workspace ──────────────────────────────────────

  function sampleAutoTemplate() {
    return {
      id: `template-${Date.now()}`,
      name: '新自动配表模板',
      inputs: [
        { key: 'type', label: '类型', type: 'select', options: ['monster'] },
        { key: 'name', label: '名称', type: 'text' },
        { key: 'level', label: '等级', type: 'number' }
      ],
      idSequences: [
        { key: 'mainId', label: '主表ID' }
      ],
      tables: [
        {
          key: 'main',
          relativePath: 'Design/Tables/Example.xlsx',
          sheetName: 'Sheet1',
          headerRow: 1,
          primaryKey: 'ID',
          copyRow: 2,
          rows: [
            {
              key: 'mainRow',
              condition: { input: 'type', op: 'equals', value: 'monster' },
              fields: {
                ID: { type: 'id', sequence: 'mainId' },
                Name: { type: 'input', key: 'name' },
                Level: { type: 'input', key: 'level' }
              }
            }
          ]
        }
      ]
    };
  }

  function showAutoConfigWorkspace(showAuto) {
    if (showAuto) {
      $mainContainer.classList.add('hidden');
      $autoConfigShell.classList.remove('hidden');
      loadAutoTemplates();
    } else {
      $autoConfigShell.classList.add('hidden');
      $mainContainer.classList.remove('hidden');
    }
  }

  function setAutoTab(tab) {
    const isTemplateTab = tab === 'template';
    $templatePanel.classList.toggle('hidden', !isTemplateTab);
    $runPanel.classList.toggle('hidden', isTemplateTab);
    $btnTemplateTab.classList.toggle('btn-primary', isTemplateTab);
    $btnRunTab.classList.toggle('btn-primary', !isTemplateTab);
    if (!isTemplateTab) renderRunTemplateSelect();
  }

  async function loadAutoTemplates() {
    autoTemplates = await window.templateApi.list();
    if (!Array.isArray(autoTemplates)) autoTemplates = [];
    if (!activeAutoTemplateId && autoTemplates.length > 0) {
      activeAutoTemplateId = autoTemplates[0].id;
    }
    renderAutoTemplateList();
    renderSelectedTemplateEditor();
    renderRunTemplateSelect();
  }

  function renderAutoTemplateList() {
    $templateList.innerHTML = '';
    if (autoTemplates.length === 0) {
      const li = document.createElement('li');
      li.style.cssText = 'padding: 20px 14px; color: var(--text-muted); font-size: 12px; text-align: center;';
      li.textContent = '暂无模板，点击 + 新建';
      $templateList.appendChild(li);
      return;
    }

    autoTemplates.forEach(template => {
      const li = document.createElement('li');
      li.className = 'group-item' + (template.id === activeAutoTemplateId ? ' active' : '');
      li.innerHTML = `
        <span class="group-item-name">${escapeHtml(template.name || template.id)}</span>
        <span class="group-item-count">${(template.tables || []).length}</span>
      `;
      li.addEventListener('click', () => {
        activeAutoTemplateId = template.id;
        renderAutoTemplateList();
        renderSelectedTemplateEditor();
        renderRunTemplateSelect();
      });
      $templateList.appendChild(li);
    });
  }

  function selectedAutoTemplate() {
    return autoTemplates.find(template => template.id === activeAutoTemplateId) || null;
  }

  function formatJson(value) {
    return JSON.stringify(value || [], null, 2);
  }

  function parseJsonText(text, fallback, label) {
    const trimmed = text.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`${label} JSON 格式错误: ${e.message}`);
    }
  }

  function normalizeTemplate(template) {
    return window.templateVisualUtils.normalizeTemplate(template);
  }

  function applyTemplateToEditor(template) {
    const normalized = normalizeTemplate(template);
    $templateNameInput.value = normalized.name || '';
    $templateIdInput.value = normalized.id || '';
    $templateInputsText.value = formatJson(normalized.inputs);
    $templateIdsText.value = formatJson(normalized.idSequences);
    $templateTablesText.value = formatJson(normalized.tables);
    renderVisualTemplateEditor(normalized);
    return normalized;
  }

  function syncEditorFromFullJson() {
    const data = parseJsonText($templateFullJsonText.value, null, '完整模板');
    let template;
    try {
      template = window.templateVisualUtils.extractTemplateFromImport(data, $templateIdInput.value.trim());
    } catch (e) {
      if (!/没有找到模板 ID/.test(e.message)) throw e;
      template = window.templateVisualUtils.extractTemplateFromImport(data);
    }

    const normalized = applyTemplateToEditor(template);
    activeAutoTemplateId = normalized.id || activeAutoTemplateId;
    renderAutoTemplateList();
    renderRunTemplateSelect();
    return normalized;
  }

  function optionTags(values, selected) {
    return values.map(value => {
      const isSelected = value === selected ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(value)}</option>`;
    }).join('');
  }

  function visualInput(label, className, value = '', type = 'text') {
    return `
      <div>
        <span class="visual-mini-label">${escapeHtml(label)}</span>
        <input type="${type}" class="input ${className}" value="${escapeHtml(String(value ?? ''))}">
      </div>`;
  }

  function renderVisualTemplateEditor(template) {
    const normalized = normalizeTemplate(template);
    renderVisualInputs(normalized.inputs);
    renderVisualIds(normalized.idSequences);
    renderVisualTables(normalized.tables);
  }

  function renderVisualInputs(inputs) {
    if (!inputs.length) {
      $visualInputsList.innerHTML = '<div class="visual-empty">暂无输入字段</div>';
      return;
    }
    $visualInputsList.innerHTML = inputs.map((field, index) => `
      <div class="visual-card visual-input-card">
        <div class="visual-card-header">
          <span class="visual-card-title">输入字段 ${index + 1}</span>
          <button class="btn btn-danger btn-sm" data-visual-action="remove-input" data-index="${index}">×</button>
        </div>
        <div class="visual-grid">
          ${visualInput('字段 Key', 'visual-input-key', field.key)}
          ${visualInput('显示名称（备注名）', 'visual-input-label', field.label)}
          <div>
            <span class="visual-mini-label">类型</span>
            <select class="input visual-input-type">${optionTags(['text', 'number', 'select', 'boolean'], field.type)}</select>
          </div>
          ${visualInput('下拉选项（逗号分隔）', 'visual-input-options', (field.options || []).join(','))}
        </div>
      </div>
    `).join('');
  }

  function renderVisualIds(idSequences) {
    if (!idSequences.length) {
      $visualIdsList.innerHTML = '<div class="visual-empty">暂无 ID 序列</div>';
      return;
    }
    $visualIdsList.innerHTML = idSequences.map((sequence, index) => `
      <div class="visual-card visual-id-card">
        <div class="visual-card-header">
          <span class="visual-card-title">ID 序列 ${index + 1}</span>
          <button class="btn btn-danger btn-sm" data-visual-action="remove-id" data-index="${index}">×</button>
        </div>
        <div class="visual-grid two">
          ${visualInput('序列 Key', 'visual-id-key', sequence.key)}
          ${visualInput('显示名称（备注名）', 'visual-id-label', sequence.label)}
        </div>
      </div>
    `).join('');
  }

  function fieldSpecToVisual(spec) {
    const normalized = window.templateVisualUtils.normalizeTemplate({
      id: 'tmp',
      name: 'tmp',
      tables: [{ rows: [{ fields: { Field: spec } }] }]
    }).tables[0].rows[0].fields.Field;
    if (normalized.type === 'input') return { type: 'input', arg: normalized.key, arg2: '', constant: '' };
    if (normalized.type === 'id') return { type: 'id', arg: normalized.sequence, arg2: '', constant: '' };
    if (normalized.type === 'ref') return { type: 'ref', arg: normalized.row, arg2: normalized.field, constant: '' };
    return { type: 'constant', arg: '', arg2: '', constant: normalized.value };
  }

  function renderVisualFields(fields, tableIndex, rowIndex) {
    const entries = Object.entries(fields || {});
    if (!entries.length) return '<div class="visual-empty">暂无字段映射</div>';
    return entries.map(([header, spec], fieldIndex) => {
      const visual = fieldSpecToVisual(spec);
      return `
        <div class="visual-card visual-field-card">
          <div class="visual-card-header">
            <span class="visual-card-title">字段 ${fieldIndex + 1}</span>
            <button class="btn btn-danger btn-sm" data-visual-action="remove-field" data-table-index="${tableIndex}" data-row-index="${rowIndex}" data-field-index="${fieldIndex}">×</button>
          </div>
          <div class="visual-grid">
            ${visualInput('Excel 表头', 'visual-field-header', header)}
            <div>
              <span class="visual-mini-label">值类型</span>
              <select class="input visual-field-type">${optionTags(['constant', 'input', 'id', 'ref'], visual.type)}</select>
            </div>
            ${visualInput('参数1（输入Key/ID序列/引用行）', 'visual-field-arg', visual.arg)}
            ${visualInput('参数2（引用字段）', 'visual-field-arg2', visual.arg2)}
          </div>
          <div class="visual-grid two" style="margin-top: 8px;">
            ${visualInput('常量值', 'visual-field-constant', visual.constant)}
          </div>
        </div>`;
    }).join('');
  }

  function renderVisualRows(rows, tableIndex) {
    if (!rows.length) return '<div class="visual-empty">暂无行规则</div>';
    return rows.map((row, rowIndex) => {
      const condition = row.condition || {};
      const condValue = condition.op === 'in' ? (condition.values || []).join(',') : (condition.value || '');
      const rowTitle = row.key || `行规则 ${rowIndex + 1}`;
      return `
        <div class="visual-card visual-row-card">
          <div class="visual-card-header">
            <span class="visual-card-title">${escapeHtml(rowTitle)}</span>
            <div class="visual-card-actions">
              <button class="btn btn-sm" data-visual-action="move-row-up" data-table-index="${tableIndex}" data-row-index="${rowIndex}" title="上移">↑</button>
              <button class="btn btn-sm" data-visual-action="move-row-down" data-table-index="${tableIndex}" data-row-index="${rowIndex}" title="下移">↓</button>
              <button class="btn btn-sm" data-visual-action="toggle-row" title="收起/展开">收起</button>
              <button class="btn btn-danger btn-sm" data-visual-action="remove-row" data-table-index="${tableIndex}" data-row-index="${rowIndex}">×</button>
            </div>
          </div>
          <div class="visual-card-body">
            <div class="visual-grid">
              ${visualInput('行 Key', 'visual-row-key', row.key)}
              ${visualInput('条件输入 Key', 'visual-condition-input', condition.input || '')}
              <div>
                <span class="visual-mini-label">条件</span>
                <select class="input visual-condition-op">${optionTags(['equals', 'in'], condition.op || 'equals')}</select>
              </div>
              ${visualInput('条件值（in 用逗号分隔）', 'visual-condition-value', condValue)}
            </div>
            <div class="visual-row-list">
              ${renderVisualFields(row.fields, tableIndex, rowIndex)}
              <div class="visual-row-actions">
                <button class="btn btn-sm" data-visual-action="add-field" data-table-index="${tableIndex}" data-row-index="${rowIndex}">+ 字段</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderVisualTables(tables) {
    if (!tables.length) {
      $visualTablesList.innerHTML = '<div class="visual-empty">暂无目标表</div>';
      return;
    }
    $visualTablesList.innerHTML = tables.map((table, tableIndex) => `
      <div class="visual-card visual-table-card">
        <div class="visual-card-header">
          <span class="visual-card-title">${escapeHtml([table.key, table.sheetName, table.relativePath].filter(Boolean).join(' / ') || `目标表 ${tableIndex + 1}`)}</span>
          <div class="visual-card-actions">
            <button class="btn btn-sm" data-visual-action="move-table-up" data-index="${tableIndex}" title="上移">↑</button>
            <button class="btn btn-sm" data-visual-action="move-table-down" data-index="${tableIndex}" title="下移">↓</button>
            <button class="btn btn-sm" data-visual-action="toggle-table" title="收起/展开">收起</button>
            <button class="btn btn-danger btn-sm" data-visual-action="remove-table" data-index="${tableIndex}">×</button>
          </div>
        </div>
        <div class="visual-card-body">
          <div class="visual-grid three">
            ${visualInput('配置表名', 'visual-table-key', table.key)}
            ${visualInput('Excel 相对路径', 'visual-table-path', table.relativePath)}
            ${visualInput('Sheet 名', 'visual-table-sheet', table.sheetName)}
            ${visualInput('表头行', 'visual-table-header-row', table.headerRow, 'number')}
            ${visualInput('主键列名', 'visual-table-primary-key', table.primaryKey)}
            ${visualInput('标准行（用于复制）', 'visual-table-copy-row', table.copyRow || '', 'number')}
          </div>
          <div class="visual-row-list">
            ${renderVisualRows(table.rows || [], tableIndex)}
            <div class="visual-row-actions">
              <button class="btn btn-sm" data-visual-action="add-row" data-table-index="${tableIndex}">+ 行规则</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function splitList(value) {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  }

  function collectVisualTemplateFromDom() {
    const inputs = [...$visualInputsList.querySelectorAll('.visual-input-card')].map(card => ({
      key: card.querySelector('.visual-input-key').value.trim(),
      label: card.querySelector('.visual-input-label').value.trim(),
      type: card.querySelector('.visual-input-type').value,
      options: splitList(card.querySelector('.visual-input-options').value)
    })).filter(field => field.key);

    const idSequences = [...$visualIdsList.querySelectorAll('.visual-id-card')].map(card => ({
      key: card.querySelector('.visual-id-key').value.trim(),
      label: card.querySelector('.visual-id-label').value.trim()
    })).filter(sequence => sequence.key);

    const tables = [...$visualTablesList.querySelectorAll(':scope > .visual-table-card')].map(tableCard => {
      const rows = [...tableCard.querySelectorAll(':scope > .visual-card-body > .visual-row-list > .visual-row-card')].map(rowCard => {
        const fields = {};
        [...rowCard.querySelectorAll(':scope > .visual-card-body > .visual-row-list .visual-field-card')].forEach(fieldCard => {
          const header = fieldCard.querySelector('.visual-field-header').value.trim();
          const type = fieldCard.querySelector('.visual-field-type').value;
          const arg = fieldCard.querySelector('.visual-field-arg').value.trim();
          const arg2 = fieldCard.querySelector('.visual-field-arg2').value.trim();
          const constant = fieldCard.querySelector('.visual-field-constant').value;
          if (!header) return;
          if (type === 'input') fields[header] = { type, key: arg };
          else if (type === 'id') fields[header] = { type, sequence: arg };
          else if (type === 'ref') fields[header] = { type, row: arg, field: arg2 };
          else fields[header] = { type: 'constant', value: constant };
        });

        const conditionInput = rowCard.querySelector('.visual-condition-input').value.trim();
        const conditionOp = rowCard.querySelector('.visual-condition-op').value;
        const conditionValue = rowCard.querySelector('.visual-condition-value').value;
        let condition = null;
        if (conditionInput) {
          condition = conditionOp === 'in'
            ? { input: conditionInput, op: 'in', values: splitList(conditionValue) }
            : { input: conditionInput, op: 'equals', value: conditionValue };
        }

        return {
          key: rowCard.querySelector('.visual-row-key').value.trim(),
          condition,
          fields
        };
      }).filter(row => row.key);

      return {
        key: tableCard.querySelector('.visual-table-key').value.trim(),
        relativePath: tableCard.querySelector('.visual-table-path').value.trim(),
        sheetName: tableCard.querySelector('.visual-table-sheet').value.trim(),
        headerRow: Number(tableCard.querySelector('.visual-table-header-row').value || 1),
        primaryKey: tableCard.querySelector('.visual-table-primary-key').value.trim(),
        copyRow: tableCard.querySelector('.visual-table-copy-row').value ? Number(tableCard.querySelector('.visual-table-copy-row').value) : undefined,
        rows
      };
    }).filter(table => table.key || table.relativePath || table.sheetName);

    return normalizeTemplate({
      id: $templateIdInput.value.trim(),
      name: $templateNameInput.value.trim(),
      inputs,
      idSequences,
      tables
    });
  }

  function syncJsonFromVisual() {
    const template = collectVisualTemplateFromDom();
    $templateInputsText.value = formatJson(template.inputs);
    $templateIdsText.value = formatJson(template.idSequences);
    $templateTablesText.value = formatJson(template.tables);
    return template;
  }

  function readTemplateFromJsonEditor() {
    return normalizeTemplate({
      id: $templateIdInput.value.trim(),
      name: $templateNameInput.value.trim(),
      inputs: parseJsonText($templateInputsText.value, [], '输入字段'),
      idSequences: parseJsonText($templateIdsText.value, [], 'ID 序列'),
      tables: parseJsonText($templateTablesText.value, [], '目标表与行规则')
    });
  }

  function syncVisualFromJson() {
    const template = readTemplateFromJsonEditor();
    renderVisualTemplateEditor(template);
    $templateInputsText.value = formatJson(template.inputs);
    $templateIdsText.value = formatJson(template.idSequences);
    $templateTablesText.value = formatJson(template.tables);
    return template;
  }

  function renderSelectedTemplateEditor() {
    const template = selectedAutoTemplate();
    $templateFullJsonText.value = '';
    if (!template) {
      $templateNameInput.value = '';
      $templateIdInput.value = '';
      const sample = normalizeTemplate(sampleAutoTemplate());
      $templateInputsText.value = formatJson(sample.inputs);
      $templateIdsText.value = formatJson(sample.idSequences);
      $templateTablesText.value = formatJson(sample.tables);
      renderVisualTemplateEditor(sample);
      return;
    }

    applyTemplateToEditor(template);
  }

  async function saveTemplateFromEditor() {
    try {
      const template = readTemplateFromJsonEditor();

      if (!template.id || !template.name) {
        showToast('模板名称和模板 ID 不能为空', 'error');
        return;
      }

      const result = await window.templateApi.save(template);
      if (!result.ok) {
        showToast('保存模板失败: ' + result.error, 'error');
        return;
      }
      activeAutoTemplateId = result.data.id;
      await loadAutoTemplates();
      showToast('模板已保存', 'success');
    } catch (e) {
      showToast(e.message, 'error', 6000);
    }
  }

  function renderRunTemplateSelect() {
    $runTemplateSelect.innerHTML = '';
    autoTemplates.forEach(template => {
      const opt = document.createElement('option');
      opt.value = template.id;
      opt.textContent = template.name || template.id;
      $runTemplateSelect.appendChild(opt);
    });
    if (activeAutoTemplateId) $runTemplateSelect.value = activeAutoTemplateId;
    renderRunFields();
  }

  function createRunField(field, value) {
    const wrap = document.createElement('div');
    wrap.className = 'auto-field';
    const label = document.createElement('label');
    label.textContent = field.label || field.key;
    wrap.appendChild(label);

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      (field.options || []).forEach(optionValue => {
        const opt = document.createElement('option');
        opt.value = optionValue;
        opt.textContent = optionValue;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type === 'number' ? 'number' : (field.type === 'boolean' ? 'checkbox' : 'text');
    }
    input.className = 'input';
    input.dataset.key = field.key;
    if (field.type === 'boolean') input.checked = value === true;
    else if (value !== undefined) input.value = value;
    wrap.appendChild(input);
    return wrap;
  }

  function createRunInputElement(field, value) {
    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      (field.options || []).forEach(optionValue => {
        const opt = document.createElement('option');
        opt.value = optionValue;
        opt.textContent = optionValue;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type === 'number' ? 'number' : (field.type === 'boolean' ? 'checkbox' : 'text');
    }
    input.className = 'input run-item-input';
    input.dataset.runItemKey = field.key;
    if (field.type === 'boolean') input.checked = value === true;
    else if (value !== undefined && value !== null) input.value = value;
    return input;
  }

  function normalizeRunItemsForUi(prefill = {}) {
    if (Array.isArray(prefill.items)) return prefill.items.length > 0 ? prefill.items : [{}];
    if (prefill.inputs && typeof prefill.inputs === 'object') return [prefill.inputs];
    return [{}];
  }

  function renderRunItems(prefillItems) {
    const template = autoTemplates.find(t => t.id === $runTemplateSelect.value) || selectedAutoTemplate();
    const fields = template && Array.isArray(template.inputs) ? template.inputs : [];
    runItems = Array.isArray(prefillItems) && prefillItems.length > 0 ? prefillItems : [{}];
    $runItemsTable.innerHTML = '';

    if (!template) {
      $runItemsTable.textContent = '暂无模板';
      return;
    }
    if (fields.length === 0) {
      $runItemsTable.textContent = '暂无输入字段';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'run-items-grid';
    grid.style.gridTemplateColumns = `repeat(${fields.length}, minmax(120px, 1fr)) 42px`;

    fields.forEach(field => {
      const header = document.createElement('div');
      header.className = 'run-item-header';
      header.textContent = field.label || field.key;
      grid.appendChild(header);
    });
    const actionHeader = document.createElement('div');
    actionHeader.className = 'run-item-header';
    grid.appendChild(actionHeader);

    runItems.forEach((item, itemIndex) => {
      const row = document.createElement('div');
      row.className = 'run-item-row';
      row.dataset.index = String(itemIndex);

      fields.forEach(field => {
        const cell = document.createElement('div');
        cell.className = 'run-item-cell';
        cell.appendChild(createRunInputElement(field, item && item[field.key]));
        row.appendChild(cell);
      });

      const actionCell = document.createElement('div');
      actionCell.className = 'run-item-cell run-item-action-cell';
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-sm run-item-remove';
      removeButton.dataset.runItemAction = 'remove';
      removeButton.dataset.index = String(itemIndex);
      removeButton.textContent = '×';
      removeButton.title = '删除这一行';
      removeButton.disabled = runItems.length <= 1;
      actionCell.appendChild(removeButton);
      row.appendChild(actionCell);

      grid.appendChild(row);
    });

    $runItemsTable.appendChild(grid);
  }

  function renderRunFields(prefill = {}) {
    const template = autoTemplates.find(t => t.id === $runTemplateSelect.value) || selectedAutoTemplate();
    $runInputFields.innerHTML = '';
    $runIdFields.innerHTML = '';
    if (!template) {
      $runInputFields.textContent = '暂无模板';
      $runIdFields.textContent = '暂无 ID 序列';
      renderRunItems([{}]);
      return;
    }

    renderRunItems(normalizeRunItemsForUi(prefill));

    (template.idSequences || []).forEach(sequence => {
      $runIdFields.appendChild(createRunField({
        key: sequence.key,
        label: sequence.label || sequence.key,
        type: 'number'
      }, prefill.idStarts && prefill.idStarts[sequence.key]));
    });
  }

  function collectRunRequest() {
    const templateId = $runTemplateSelect.value || activeAutoTemplateId;
    const idStarts = {};

    $runIdFields.querySelectorAll('[data-key]').forEach(input => {
      if (input.value !== '') idStarts[input.dataset.key] = Number(input.value);
    });

    return { templateId, items: collectRunItemsFromDom(), idStarts };
  }

  function collectRunItemsFromDom() {
    const rows = [...$runItemsTable.querySelectorAll('.run-item-row')];
    const items = rows.map(row => {
      const item = {};
      row.querySelectorAll('[data-run-item-key]').forEach(input => {
        if (input.type === 'checkbox') item[input.dataset.runItemKey] = input.checked;
        else if (input.type === 'number') item[input.dataset.runItemKey] = input.value === '' ? '' : Number(input.value);
        else item[input.dataset.runItemKey] = input.value;
      });
      return item;
    });
    return items.length > 0 ? items : [{}];
  }

  function summarizePlan(plan) {
    if (!plan) return '';
    const lines = [];
    lines.push(`模板: ${plan.templateName || plan.templateId || ''}`);
    if (plan.errors && plan.errors.length > 0) {
      lines.push('\n错误:');
      plan.errors.forEach(error => lines.push(`- ${error}`));
    }
    if (plan.warnings && plan.warnings.length > 0) {
      lines.push('\n警告:');
      plan.warnings.forEach(warning => lines.push(`- ${warning}`));
    }
    lines.push(`\n变更数量: ${(plan.changes || []).length}`);
    if (plan.ok && (!plan.changes || plan.changes.length === 0)) {
      lines.push('没有生成变更。请检查：目标表里是否添加了行规则；行规则条件是否命中；字段映射是否填写了要覆盖的 Excel 表头。');
    }
    const changesByItem = new Map();
    (plan.changes || []).forEach(change => {
      const itemIndex = Number.isInteger(change.itemIndex) ? change.itemIndex : 0;
      if (!changesByItem.has(itemIndex)) changesByItem.set(itemIndex, []);
      changesByItem.get(itemIndex).push(change);
    });
    [...changesByItem.entries()].sort((left, right) => left[0] - right[0]).forEach(([itemIndex, itemChanges]) => {
      lines.push(`\n第 ${itemIndex + 1} 行:`);
      itemChanges.forEach(change => {
        lines.push(`- ${change.action === 'insert' ? '新增' : '更新'} ${change.relativePath} / ${change.sheetName} 第 ${change.rowNumber} 行，${change.primaryKey}=${change.primaryValue}`);
        Object.entries(change.changes || {}).forEach(([header, diff]) => {
          lines.push(`  ${header}: ${diff.before} -> ${diff.after}`);
        });
      });
    });
    return lines.join('\n');
  }

  async function previewAutoConfig() {
    const request = collectRunRequest();
    const result = await window.autoConfigApi.preview(request);
    $autoPreviewOutput.textContent = summarizePlan(result);
    if (result.ok) showToast('预览已生成', 'success');
    else showToast('预览存在错误，请检查输出', 'error');
    return result;
  }

  $btnAutoConfig.addEventListener('click', () => showAutoConfigWorkspace(true));
  $btnBackToFavorites.addEventListener('click', () => showAutoConfigWorkspace(false));
  $btnTemplateTab.addEventListener('click', () => setAutoTab('template'));
  $btnRunTab.addEventListener('click', () => setAutoTab('run'));

  $btnNewTemplate.addEventListener('click', () => {
    const template = sampleAutoTemplate();
    activeAutoTemplateId = template.id;
    autoTemplates.push(template);
    renderAutoTemplateList();
    renderSelectedTemplateEditor();
  });

  $btnSaveTemplate.addEventListener('click', saveTemplateFromEditor);
  $btnFullJsonToEditor.addEventListener('click', () => {
    try {
      const template = syncEditorFromFullJson();
      showToast(`已解析完整 JSON: ${template.name || template.id}`, 'success');
    } catch (e) {
      showToast(e.message, 'error', 6000);
    }
  });
  $btnVisualToJson.addEventListener('click', () => {
    syncJsonFromVisual();
    showToast('已从可视化生成 JSON', 'success');
  });
  $btnJsonToVisual.addEventListener('click', () => {
    try {
      syncVisualFromJson();
      showToast('已从 JSON 渲染可视化面板', 'success');
    } catch (e) {
      showToast(e.message, 'error', 6000);
    }
  });

  function mutateVisualTemplate(mutator) {
    let template;
    try {
      template = syncJsonFromVisual();
      mutator(template);
      template = normalizeTemplate(template);
      renderVisualTemplateEditor(template);
      $templateInputsText.value = formatJson(template.inputs);
      $templateIdsText.value = formatJson(template.idSequences);
      $templateTablesText.value = formatJson(template.tables);
    } catch (e) {
      showToast(e.message, 'error', 6000);
    }
  }

  function moveItem(items, fromIndex, toIndex) {
    if (!Array.isArray(items)) return;
    if (fromIndex < 0 || fromIndex >= items.length) return;
    if (toIndex < 0 || toIndex >= items.length) return;
    const [item] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, item);
  }

  function toggleVisualCard(button, cardSelector) {
    const card = button.closest(cardSelector);
    if (!card) return;
    const body = card.querySelector(':scope > .visual-card-body');
    if (!body) return;
    const collapsed = body.classList.toggle('hidden');
    button.textContent = collapsed ? '展开' : '收起';
  }

  $btnAddVisualInput.addEventListener('click', () => {
    mutateVisualTemplate(template => template.inputs.push({ key: '', label: '', type: 'text', options: [] }));
  });

  $btnAddVisualId.addEventListener('click', () => {
    mutateVisualTemplate(template => template.idSequences.push({ key: '', label: '' }));
  });

  $btnAddVisualTable.addEventListener('click', () => {
    mutateVisualTemplate(template => template.tables.push({
      key: '',
      relativePath: '',
      sheetName: '',
      headerRow: 1,
      primaryKey: '',
      copyRow: 2,
      rows: []
    }));
  });

  [$visualInputsList, $visualIdsList, $visualTablesList].forEach(list => {
    list.addEventListener('input', syncJsonFromVisual);
    list.addEventListener('change', syncJsonFromVisual);
  });

  $visualTablesList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-visual-action]');
    if (!button) return;

    const action = button.dataset.visualAction;
    if (action === 'toggle-table') {
      toggleVisualCard(button, '.visual-table-card');
      return;
    }
    if (action === 'toggle-row') {
      toggleVisualCard(button, '.visual-row-card');
      return;
    }

    mutateVisualTemplate(template => {
      if (action === 'remove-table') {
        template.tables.splice(Number(button.dataset.index), 1);
      } else if (action === 'move-table-up') {
        const index = Number(button.dataset.index);
        moveItem(template.tables, index, index - 1);
      } else if (action === 'move-table-down') {
        const index = Number(button.dataset.index);
        moveItem(template.tables, index, index + 1);
      } else if (action === 'add-row') {
        const table = template.tables[Number(button.dataset.tableIndex)];
        if (table) {
          const sequence = (template.idSequences && template.idSequences[0] && template.idSequences[0].key) || '';
          const primaryKey = table.primaryKey || 'id';
          const rowNumber = (table.rows || []).length + 1;
          table.rows.push({
            key: `${table.key || 'row'}Row${rowNumber}`,
            condition: null,
            fields: {
              [primaryKey]: sequence
                ? { type: 'id', sequence }
                : { type: 'constant', value: '' },
              ...Object.fromEntries((template.inputs || [])
                .filter(input => input.key && input.key !== primaryKey)
                .map(input => [input.key, { type: 'input', key: input.key }]))
            }
          });
        }
      } else if (action === 'remove-row') {
        const table = template.tables[Number(button.dataset.tableIndex)];
        if (table) table.rows.splice(Number(button.dataset.rowIndex), 1);
      } else if (action === 'move-row-up') {
        const table = template.tables[Number(button.dataset.tableIndex)];
        if (table) {
          const index = Number(button.dataset.rowIndex);
          moveItem(table.rows, index, index - 1);
        }
      } else if (action === 'move-row-down') {
        const table = template.tables[Number(button.dataset.tableIndex)];
        if (table) {
          const index = Number(button.dataset.rowIndex);
          moveItem(table.rows, index, index + 1);
        }
      } else if (action === 'add-field') {
        const table = template.tables[Number(button.dataset.tableIndex)];
        const row = table && table.rows[Number(button.dataset.rowIndex)];
        if (row) row.fields.NewField = { type: 'constant', value: '' };
      } else if (action === 'remove-field') {
        const table = template.tables[Number(button.dataset.tableIndex)];
        const row = table && table.rows[Number(button.dataset.rowIndex)];
        if (row) {
          const header = Object.keys(row.fields || {})[Number(button.dataset.fieldIndex)];
          if (header) delete row.fields[header];
        }
      }
    });
  });

  $visualInputsList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-visual-action="remove-input"]');
    if (!button) return;
    mutateVisualTemplate(template => template.inputs.splice(Number(button.dataset.index), 1));
  });

  $visualIdsList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-visual-action="remove-id"]');
    if (!button) return;
    mutateVisualTemplate(template => template.idSequences.splice(Number(button.dataset.index), 1));
  });

  $btnDeleteTemplate.addEventListener('click', async () => {
    const template = selectedAutoTemplate();
    if (!template) return;
    if (!confirm(`确定删除模板「${template.name || template.id}」吗？`)) return;
    const result = await window.templateApi.delete(template.id);
    if (!result.ok) {
      showToast('删除模板失败', 'error');
      return;
    }
    activeAutoTemplateId = '';
    await loadAutoTemplates();
    showToast('模板已删除', 'success');
  });

  $btnImportTemplate.addEventListener('click', async () => {
    const result = await window.templateApi.import();
    if (!result.ok) {
      if (result.error !== 'cancelled') showToast('导入模板失败: ' + result.error, 'error');
      return;
    }
    activeAutoTemplateId = result.data[0] && result.data[0].id;
    await loadAutoTemplates();
    showToast('模板已导入', 'success');
  });

  $btnExportTemplate.addEventListener('click', async () => {
    const result = await window.templateApi.export(activeAutoTemplateId || null);
    if (!result.ok) {
      if (result.error !== 'cancelled') showToast('导出模板失败: ' + result.error, 'error');
      return;
    }
    showToast('模板已导出: ' + result.data.filePath, 'success', 5000);
  });

  $runTemplateSelect.addEventListener('change', () => {
    activeAutoTemplateId = $runTemplateSelect.value;
    renderAutoTemplateList();
    renderRunFields();
  });

  $btnAddRunItem.addEventListener('click', () => {
    const items = collectRunItemsFromDom();
    items.push({});
    renderRunItems(items);
  });

  $runItemsTable.addEventListener('click', (event) => {
    const button = event.target.closest('[data-run-item-action="remove"]');
    if (!button) return;
    const items = collectRunItemsFromDom();
    if (items.length <= 1) return;
    items.splice(Number(button.dataset.index), 1);
    renderRunItems(items);
  });

  $btnLoadRunJson.addEventListener('click', () => {
    try {
      const data = parseJsonText($runJsonText.value, null, '执行参数');
      if (!data || !data.templateId) throw new Error('执行 JSON 缺少 templateId');
      activeAutoTemplateId = data.templateId;
      $runTemplateSelect.value = data.templateId;
      $runJsonStatus.value = `已载入 ${data.templateId}`;
      renderAutoTemplateList();
      renderRunFields(data);
    } catch (e) {
      showToast(e.message, 'error', 6000);
    }
  });

  $btnDumpRunJson.addEventListener('click', () => {
    $runJsonText.value = formatJson(collectRunRequest());
    $runJsonStatus.value = '已从界面生成 JSON';
  });

  $btnPreviewAutoConfig.addEventListener('click', previewAutoConfig);

  $btnExecuteAutoConfig.addEventListener('click', async () => {
    const preview = await previewAutoConfig();
    if (!preview.ok) return;
    if (!preview.changes || preview.changes.length === 0) {
      showToast('没有可写入的变更，请先配置行规则或检查条件', 'error', 6000);
      return;
    }
    if (!confirm(`即将 checkout 并写入 ${(preview.changes || []).length} 项变更，确认继续？`)) return;
    const result = await window.autoConfigApi.execute(collectRunRequest());
    if (result.ok) {
      $autoPreviewOutput.textContent = summarizePlan(result.plan) +
        `\n\n写入完成\n备份:\n${(result.result.backups || []).map(b => `- ${b.backupPath}`).join('\n')}`;
      showToast('自动配表已写入，提交前请在 P4V 中审核', 'success', 6000);
    } else {
      $autoPreviewOutput.textContent = summarizePlan(result);
      showToast('写入失败，请检查输出', 'error', 6000);
    }
  });

  // ── Helpers ────────────────────────────────────────────────────

  function getFileName(filePath) {
    return filePath.split('/').pop();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => closeModal(m));
    }
  });

  // ── Init ───────────────────────────────────────────────────────

  async function init() {
    config = await window.configApi.get();
    if (!config.groups) config.groups = [];
    if (!config.favoriteWorkspaces) config.favoriteWorkspaces = [];

    renderGroups();
    renderFiles();

    const isFirstLaunch = !config._initialized;

    const connected = await checkP4Connection();

    if (isFirstLaunch) {
      if (connected) {
        showToast('首次使用：已自动检测到 P4 连接，请确认设置后保存', 'info', 6000);
      } else {
        showToast('首次使用：请先配置 P4 连接信息', 'info', 6000);
      }
      $settingPort.value = config.p4.port || '';
      $settingUser.value = config.p4.user || '';
      $settingClient.value = config.p4.client || '';
      $settingDepot.value = config.p4.depot || '';
      openModal($modalSettings);

      if (!config.p4.user || !config.p4.client) {
        $btnDetectP4.click();
      }
    } else if (connected) {
      await loadWorkspaces();
    }
  }

  init();
})();
