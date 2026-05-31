const editor = document.getElementById('editor');
const newBtn = document.querySelector('.btn-new');
const deleteBtn = document.querySelector('.btn-delete');
const exportBtn = document.querySelector('.btn-export');
const importBtn = document.querySelector('.btn-import');
const toolbarButtons = document.querySelectorAll('.toolbar-btn');
const textColorSelect = document.getElementById('textColor');

let currentNoteId = null;
let currentVersion = 1;
let isUpdatingFromRemote = false;
let debounceTimer = null;
let pendingSave = null;
let conflictDialog = null;
let passwordDialog = null;

function getNoteIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('noteId');
}

async function init() {
  currentNoteId = getNoteIdFromURL();
  
  if (!currentNoteId) {
    currentNoteId = await window.notesAPI.getCurrentNoteId();
  }

  await loadNoteContent();
  setupEventListeners();
  setupIPCListeners();
  createConflictDialog();
  createPasswordDialog();
}

async function loadNoteContent() {
  const notes = await window.notesAPI.getAllNotes();
  const currentNote = notes.find(n => n.id === currentNoteId);
  
  if (currentNote) {
    currentVersion = currentNote.version || 1;
    if (currentNote.content) {
      isUpdatingFromRemote = true;
      editor.innerHTML = currentNote.content;
      isUpdatingFromRemote = false;
    }
  }
}

function setupEventListeners() {
  editor.addEventListener('input', () => {
    if (isUpdatingFromRemote) return;
    debouncedSave();
  });

  newBtn.addEventListener('click', () => {
    window.notesAPI.createNote();
  });

  deleteBtn.addEventListener('click', () => {
    if (confirm('确定要删除这个便签吗？')) {
      window.notesAPI.deleteNote(currentNoteId);
    }
  });

  exportBtn.addEventListener('click', () => {
    showExportPasswordDialog();
  });

  importBtn.addEventListener('click', () => {
    showImportDialog();
  });

  toolbarButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const command = btn.dataset.command;
      document.execCommand(command, false, null);
      editor.focus();
      debouncedSave();
    });
  });

  textColorSelect.addEventListener('change', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    editor.focus();
    debouncedSave();
  });

  editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold', false, null);
      debouncedSave();
    }
    if (e.ctrlKey && e.key === 'i') {
      e.preventDefault();
      document.execCommand('italic', false, null);
      debouncedSave();
    }
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      document.execCommand('underline', false, null);
      debouncedSave();
    }
  });
}

function debouncedSave() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    saveNote();
  }, 300);
}

async function saveNote() {
  if (!currentNoteId || isUpdatingFromRemote) return;
  
  const content = editor.innerHTML;
  const bounds = {
    x: window.screenX,
    y: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight
  };
  
  pendingSave = { content, bounds };
  
  const result = await window.notesAPI.updateNote(
    currentNoteId,
    content,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    currentVersion
  );
  
  if (result.success) {
    currentVersion = result.note.version;
    pendingSave = null;
  } else if (result.reason === 'version_conflict') {
    showConflictDialog(result.serverContent, result.serverNote.version, content);
  }
}

function createConflictDialog() {
  conflictDialog = document.createElement('div');
  conflictDialog.className = 'conflict-overlay';
  conflictDialog.innerHTML = `
    <div class="conflict-dialog">
      <h3>⚠️ 内容冲突</h3>
      <p>检测到该便签在其他位置已被修改，请选择要保留的版本：</p>
      <div class="conflict-content">
        <div class="conflict-section">
          <h4>📄 本地版本（您的修改）</h4>
          <div class="conflict-preview" id="localPreview"></div>
        </div>
        <div class="conflict-section">
          <h4>🌐 服务器版本（其他位置的修改）</h4>
          <div class="conflict-preview" id="serverPreview"></div>
        </div>
      </div>
      <div class="conflict-buttons">
        <button class="conflict-btn keep-local">保留本地版本</button>
        <button class="conflict-btn keep-server">使用服务器版本</button>
        <button class="conflict-btn merge">合并两个版本</button>
      </div>
    </div>
  `;
  document.body.appendChild(conflictDialog);
  
  conflictDialog.querySelector('.keep-local').addEventListener('click', () => {
    keepLocalVersion();
  });
  
  conflictDialog.querySelector('.keep-server').addEventListener('click', () => {
    keepServerVersion();
  });
  
  conflictDialog.querySelector('.merge').addEventListener('click', () => {
    mergeVersions();
  });
}

function showConflictDialog(serverContent, serverVersion, localContent) {
  conflictDialog.querySelector('#localPreview').innerHTML = localContent || '<em>（空）</em>';
  conflictDialog.querySelector('#serverPreview').innerHTML = serverContent || '<em>（空）</em>';
  conflictDialog.dataset.serverContent = serverContent;
  conflictDialog.dataset.serverVersion = serverVersion;
  conflictDialog.dataset.localContent = localContent;
  conflictDialog.style.display = 'flex';
}

function hideConflictDialog() {
  conflictDialog.style.display = 'none';
}

async function keepLocalVersion() {
  const localContent = conflictDialog.dataset.localContent;
  const bounds = {
    x: window.screenX,
    y: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight
  };
  
  const result = await window.notesAPI.forceUpdateNote(
    currentNoteId,
    localContent,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height
  );
  
  currentVersion = result.version;
  hideConflictDialog();
  pendingSave = null;
}

async function keepServerVersion() {
  const serverContent = conflictDialog.dataset.serverContent;
  const serverVersion = parseInt(conflictDialog.dataset.serverVersion);
  
  isUpdatingFromRemote = true;
  editor.innerHTML = serverContent;
  isUpdatingFromRemote = false;
  
  currentVersion = serverVersion;
  hideConflictDialog();
  pendingSave = null;
}

async function mergeVersions() {
  const localContent = conflictDialog.dataset.localContent;
  const serverContent = conflictDialog.dataset.serverContent;
  
  const mergedContent = `
    <div style="margin-bottom: 10px; padding: 8px; background: #e8f5e9; border-radius: 4px;">
      <strong>🌐 服务器版本：</strong>
      ${serverContent}
    </div>
    <div style="padding: 8px; background: #fff3e0; border-radius: 4px;">
      <strong>📄 本地版本：</strong>
      ${localContent}
    </div>
  `;
  
  isUpdatingFromRemote = true;
  editor.innerHTML = mergedContent;
  isUpdatingFromRemote = false;
  
  const bounds = {
    x: window.screenX,
    y: window.screenY,
    width: window.outerWidth,
    height: window.outerHeight
  };
  
  const result = await window.notesAPI.forceUpdateNote(
    currentNoteId,
    mergedContent,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height
  );
  
  currentVersion = result.version;
  hideConflictDialog();
  pendingSave = null;
}

function setupIPCListeners() {
  window.notesAPI.onNoteUpdated((data) => {
    if (data.id === currentNoteId && !isUpdatingFromRemote) {
      const selection = saveSelection();
      isUpdatingFromRemote = true;
      editor.innerHTML = data.content;
      currentVersion = data.version;
      isUpdatingFromRemote = false;
      restoreSelection(selection);
    }
  });

  window.notesAPI.onNoteDeleted((noteId) => {
    if (noteId === currentNoteId) {
      window.notesAPI.closeWindow();
    }
  });

  window.notesAPI.onNoteCreated((note) => {
  });

  window.notesAPI.onPromptImport((filePath) => {
    showImportPasswordDialog(filePath);
  });
}

function createPasswordDialog() {
  passwordDialog = document.createElement('div');
  passwordDialog.className = 'conflict-overlay';
  passwordDialog.innerHTML = `
    <div class="conflict-dialog password-dialog">
      <h3 id="passwordTitle">输入密码</h3>
      <p id="passwordDesc">请输入密码以加密/解密便签</p>
      <input type="password" id="passwordInput" class="password-input" placeholder="请输入密码">
      <div id="passwordError" class="password-error"></div>
      <div class="conflict-buttons">
        <button class="conflict-btn keep-server" id="passwordCancel">取消</button>
        <button class="conflict-btn keep-local" id="passwordConfirm">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(passwordDialog);

  passwordDialog.querySelector('#passwordCancel').addEventListener('click', () => {
    hidePasswordDialog();
    if (passwordDialog.dataset.mode === 'import' && passwordDialog.dataset.autoOpen) {
      window.notesAPI.closeWindow();
    }
  });

  passwordDialog.querySelector('#passwordConfirm').addEventListener('click', () => {
    handlePasswordConfirm();
  });

  passwordDialog.querySelector('#passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handlePasswordConfirm();
    }
  });
}

function showExportPasswordDialog() {
  passwordDialog.dataset.mode = 'export';
  passwordDialog.querySelector('#passwordTitle').textContent = '设置导出密码';
  passwordDialog.querySelector('#passwordDesc').textContent = '请设置密码以加密便签内容';
  passwordDialog.querySelector('#passwordInput').value = '';
  passwordDialog.querySelector('#passwordError').textContent = '';
  passwordDialog.style.display = 'flex';
  passwordDialog.querySelector('#passwordInput').focus();
}

function showImportPasswordDialog(filePath) {
  passwordDialog.dataset.mode = 'import';
  passwordDialog.dataset.filePath = filePath;
  passwordDialog.dataset.autoOpen = 'true';
  passwordDialog.querySelector('#passwordTitle').textContent = '输入解密密码';
  passwordDialog.querySelector('#passwordDesc').textContent = `请输入密码以解密便签文件：${filePath.split('\\').pop()}`;
  passwordDialog.querySelector('#passwordInput').value = '';
  passwordDialog.querySelector('#passwordError').textContent = '';
  passwordDialog.style.display = 'flex';
  passwordDialog.querySelector('#passwordInput').focus();
}

function showImportDialog() {
  passwordDialog.dataset.mode = 'import-select';
  passwordDialog.dataset.autoOpen = 'false';
  passwordDialog.querySelector('#passwordTitle').textContent = '选择要导入的便签';
  passwordDialog.querySelector('#passwordDesc').textContent = '点击确定后选择.ele便签文件';
  passwordDialog.querySelector('#passwordInput').type = 'hidden';
  passwordDialog.querySelector('#passwordError').textContent = '';
  passwordDialog.style.display = 'flex';
}

function hidePasswordDialog() {
  passwordDialog.style.display = 'none';
  passwordDialog.querySelector('#passwordInput').type = 'password';
}

async function handlePasswordConfirm() {
  const mode = passwordDialog.dataset.mode;
  const password = passwordDialog.querySelector('#passwordInput').value;
  const errorEl = passwordDialog.querySelector('#passwordError');

  if (mode === 'export') {
    if (!password || password.length < 4) {
      errorEl.textContent = '密码长度至少4位';
      return;
    }
    await handleExport(password);
  } else if (mode === 'import') {
    if (!password) {
      errorEl.textContent = '请输入密码';
      return;
    }
    const filePath = passwordDialog.dataset.filePath;
    await handleImport(filePath, password);
  } else if (mode === 'import-select') {
    hidePasswordDialog();
    const result = await window.notesAPI.showImportDialog();
    if (!result.canceled && result.filePath) {
      showImportPasswordDialog(result.filePath);
    }
  }
}

async function handleExport(password) {
  const result = await window.notesAPI.showSaveDialog({
    title: '导出便签',
    defaultPath: `便签_${new Date().toISOString().slice(0, 10)}.ele`,
    filters: [
      { name: '便签文件', extensions: ['ele'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    hidePasswordDialog();
    return;
  }

  const exportResult = await window.notesAPI.exportNote(
    currentNoteId,
    result.filePath,
    password
  );

  if (exportResult.success) {
    hidePasswordDialog();
    alert('便签导出成功！');
  } else {
    passwordDialog.querySelector('#passwordError').textContent = exportResult.error;
  }
}

async function handleImport(filePath, password) {
  const importResult = await window.notesAPI.importNote(filePath, password);

  if (importResult.success) {
    hidePasswordDialog();
    alert('便签导入成功！');
  } else {
    passwordDialog.querySelector('#passwordError').textContent = importResult.error;
  }
}

function saveSelection() {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    return selection.getRangeAt(0).cloneRange();
  }
  return null;
}

function restoreSelection(range) {
  if (range) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    try {
      selection.addRange(range);
    } catch (e) {
    }
  }
}

window.addEventListener('beforeunload', () => {
  if (pendingSave && !conflictDialog || conflictDialog.style.display !== 'flex') {
    saveNote();
  }
});

init();
