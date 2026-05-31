const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.section');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');
const serverUrlInput = document.getElementById('server-url');
const accessTokenInput = document.getElementById('access-token');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const credentialsList = document.getElementById('credentials-list');

let settings = {
  serverUrl: '',
  accessToken: '',
};

function debugLog(message, data) {
  const prefix = '[密码管理器]';
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

chrome.storage.sync.get(['serverUrl', 'accessToken'], (result) => {
  settings = {
    serverUrl: result.serverUrl || 'http://127.0.0.1:9234',
    accessToken: result.accessToken || '',
  };

  serverUrlInput.value = settings.serverUrl;
  accessTokenInput.value = settings.accessToken;

  if (settings.serverUrl && settings.accessToken) {
    testConnection();
    loadCredentials();
  }
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    const tabName = tab.dataset.tab;
    sections.forEach((s) => s.classList.remove('active'));
    document.getElementById(`${tabName}-section`).classList.add('active');
  });
});

saveBtn.addEventListener('click', () => {
  const serverUrl = serverUrlInput.value.trim();
  const accessToken = accessTokenInput.value.trim();

  chrome.storage.sync.set({ serverUrl, accessToken }, () => {
    settings = { serverUrl, accessToken };
    testConnection();
    
    saveBtn.textContent = '已保存 ✓';
    setTimeout(() => {
      saveBtn.textContent = '保存设置';
    }, 2000);
  });
});

testBtn.addEventListener('click', async () => {
  testBtn.textContent = '测试中...';
  testBtn.disabled = true;
  
  const result = await testConnection();
  
  testBtn.disabled = false;
  testBtn.textContent = result ? '连接成功 ✓' : '连接失败 ✗';
  
  setTimeout(() => {
    testBtn.textContent = '测试连接';
  }, 2000);
});

async function testConnection() {
  if (!settings.serverUrl || !settings.accessToken) {
    updateStatus(false);
    return false;
  }

  try {
    const response = await fetch(`${settings.serverUrl}/api/health`, {
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
    });

    if (response.ok) {
      updateStatus(true);
      return true;
    } else {
      updateStatus(false);
      return false;
    }
  } catch (error) {
    debugLog('连接测试失败:', error.message);
    updateStatus(false);
    return false;
  }
}

function updateStatus(connected) {
  if (connected) {
    statusIndicator.className = 'status-indicator connected';
    statusText.textContent = '已连接';
  } else {
    statusIndicator.className = 'status-indicator disconnected';
    statusText.textContent = '未连接';
  }
}

async function loadCredentials() {
  if (!settings.serverUrl || !settings.accessToken) {
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      renderCredentials([], '无法获取当前页面');
      return;
    }
    
    const url = new URL(tab.url);
    const domain = url.hostname;

    debugLog('加载凭证，域名:', domain);

    const response = await fetch(
      `${settings.serverUrl}/api/match?domain=${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      renderCredentials(data.data || []);
    } else {
      renderCredentials([], '获取凭证失败');
    }
  } catch (error) {
    debugLog('加载凭证失败:', error.message);
    renderCredentials([], '加载失败');
  }
}

function renderCredentials(credentials, message = '') {
  if (credentials.length === 0) {
    credentialsList.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <p>${message || '当前页面没有匹配的凭证'}</p>
      </div>
    `;
    return;
  }

  credentialsList.innerHTML = `
    <div style="padding: 0 0 12px 0; font-size: 12px; color: #94a3b8;">
      找到 ${credentials.length} 个凭证，点击自动填充
    </div>
  ` + credentials
    .map(
      (cred) => `
    <div class="credential-item" data-id="${cred.id}">
      <div class="credential-title">${escapeHtml(cred.title)}</div>
      <div class="credential-username">${escapeHtml(cred.username)}</div>
      ${cred.url ? `<div class="credential-url">${escapeHtml(cred.url)}</div>` : ''}
    </div>
  `
    )
    .join('');

  document.querySelectorAll('.credential-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const cred = credentials.find((c) => c.id === id);
      if (cred) {
        autofillCredential(cred);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function autofillCredential(credential) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: 'autofill',
      credentials: [credential],
    });

    if (result && result.success) {
      const items = document.querySelectorAll('.credential-item');
      items.forEach((item) => {
        if (item.dataset.id === credential.id) {
          item.style.background = 'rgba(34, 197, 94, 0.2)';
          item.style.border = '1px solid rgba(34, 197, 94, 0.4)';
        }
      });
    }
  } catch (error) {
    debugLog('自动填充失败:', error.message);
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'autofill',
            credentials: [credential],
          });
        } catch (retryError) {
          debugLog('重试自动填充失败:', retryError.message);
        }
      }, 500);
    } catch (injectError) {
      debugLog('注入脚本失败:', injectError.message);
    }
  }
}

chrome.tabs.onActivated.addListener(() => {
  if (settings.serverUrl && settings.accessToken) {
    loadCredentials();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && settings.serverUrl && settings.accessToken) {
    loadCredentials();
  }
});
