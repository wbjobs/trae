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
  debugLog('设置已加载');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.serverUrl) {
      settings.serverUrl = changes.serverUrl.newValue;
    }
    if (changes.accessToken) {
      settings.accessToken = changes.accessToken.newValue;
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('收到消息:', request.action);
  
  if (request.action === 'triggerAutofill') {
    handleAutofill(sender.tab).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  if (request.action === 'getCredentials') {
    getCredentialsForCurrentTab(sender.tab).then((credentials) => {
      sendResponse(credentials);
    });
    return true;
  }

  if (request.action === 'checkPage') {
    checkPageForLogin(sender.tab).then((result) => {
      sendResponse(result);
    });
    return true;
  }
});

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return '';
  }
}

function normalizeDomain(domain) {
  if (!domain) return '';
  
  domain = domain.replace(/^www\./, '');
  return domain.toLowerCase();
}

async function getCredentialsForCurrentTab(tab) {
  if (!settings.serverUrl || !settings.accessToken) {
    debugLog('服务未配置');
    return [];
  }

  try {
    const domain = extractDomain(tab.url);
    if (!domain) {
      debugLog('无法提取域名');
      return [];
    }

    debugLog('获取凭证，域名:', domain);

    const response = await fetch(
      `${settings.serverUrl}/api/match?domain=${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      debugLog('API 响应错误:', response.status);
      return [];
    }

    const data = await response.json();
    
    if (!data.success) {
      debugLog('API 返回失败');
      return [];
    }

    const credentials = data.data || [];
    debugLog(`找到 ${credentials.length} 个凭证`);
    
    return credentials;
  } catch (error) {
    debugLog('获取凭证失败:', error.message);
    return [];
  }
}

async function handleAutofill(tab) {
  const credentials = await getCredentialsForCurrentTab(tab);

  if (credentials.length === 0) {
    return { success: false, message: '未找到匹配的凭证' };
  }

  debugLog(`发送自动填充消息到标签页 ${tab.id}`);
  
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: 'autofill',
      credentials,
    });

    return { 
      success: true, 
      count: credentials.length,
      filledCount: result?.filledCount || 0
    };
  } catch (error) {
    debugLog('发送消息失败:', error.message);
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'autofill',
            credentials,
          });
        } catch (retryError) {
          debugLog('重试失败:', retryError.message);
        }
      }, 500);
    } catch (injectError) {
      debugLog('注入脚本失败:', injectError.message);
    }
    
    return { success: false, message: '无法与页面通信' };
  }
}

async function checkPageForLogin(tab) {
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: 'checkPage',
    });
    return result || { hasLoginForm: false };
  } catch (error) {
    return { hasLoginForm: false };
  }
}

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const domain = extractDomain(tab.url);
    if (domain) {
      debugLog(`页面加载完成: ${domain}`);
    }
  }
});

debugLog('后台脚本已加载');
