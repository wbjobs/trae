function debugLog(message, data) {
  if (data) {
    console.log(`[密码管理器] ${message}`, data);
  } else {
    console.log(`[密码管理器] ${message}`);
  }
}

function getCurrentDomain() {
  return window.location.hostname;
}

function getVisibleInputElements(root = document) {
  const inputs = [];
  const allInputs = root.querySelectorAll('input');
  
  allInputs.forEach((input) => {
    if (isInputVisible(input)) {
      inputs.push(input);
    }
  });
  
  return inputs;
}

function isInputVisible(input) {
  if (input.type === 'hidden') return false;
  
  const style = window.getComputedStyle(input);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  const rect = input.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  
  return true;
}

function findPasswordFields(root = document) {
  const passwordFields = [];
  const inputs = getVisibleInputElements(root);
  
  inputs.forEach((input) => {
    if (isPasswordField(input)) {
      passwordFields.push(input);
    }
  });
  
  return passwordFields;
}

function isPasswordField(input) {
  const type = input.type.toLowerCase();
  const name = (input.name || '').toLowerCase();
  const id = (input.id || '').toLowerCase();
  const placeholder = (input.placeholder || '').toLowerCase();
  const autocomplete = (input.autocomplete || '').toLowerCase();
  
  if (type === 'password') return true;
  
  const passwordKeywords = ['password', 'passwd', 'pwd', 'pass'];
  if (passwordKeywords.some(kw => name.includes(kw) || id.includes(kw))) {
    return true;
  }
  
  if (autocomplete === 'current-password' || autocomplete === 'new-password') {
    return true;
  }
  
  return false;
}

function findUsernameFields(root = document) {
  const usernameFields = [];
  const inputs = getVisibleInputElements(root);
  
  inputs.forEach((input) => {
    if (isUsernameField(input) && !isPasswordField(input)) {
      usernameFields.push(input);
    }
  });
  
  return usernameFields;
}

function isUsernameField(input) {
  const type = input.type.toLowerCase();
  const name = (input.name || '').toLowerCase();
  const id = (input.id || '').toLowerCase();
  const placeholder = (input.placeholder || '').toLowerCase();
  const autocomplete = (input.autocomplete || '').toLowerCase();
  const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
  
  const usernameTypes = ['email', 'text', 'tel', 'url'];
  const usernameKeywords = [
    'username', 'user', 'login', 'email', 'mail', 'account', 
    'name', 'id', 'phone', 'mobile', 'tel'
  ];
  
  if (autocomplete === 'username' || autocomplete === 'email') {
    return true;
  }
  
  if (usernameKeywords.some(kw => name.includes(kw) || id.includes(kw))) {
    return true;
  }
  
  if (usernameKeywords.some(kw => placeholder.includes(kw) || ariaLabel.includes(kw))) {
    return true;
  }
  
  if (type === 'email') return true;
  
  return false;
}

function findLoginForms(root = document) {
  const loginForms = [];
  
  const passwordFields = findPasswordFields(root);
  const usernameFields = findUsernameFields(root);
  
  if (passwordFields.length === 0) {
    debugLog('未找到密码字段');
    return loginForms;
  }
  
  passwordFields.forEach((passwordField) => {
    let bestUsernameField = null;
    let bestDistance = Infinity;
    
    usernameFields.forEach((usernameField) => {
      const distance = calculateFieldDistance(usernameField, passwordField);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestUsernameField = usernameField;
      }
    });
    
    if (!bestUsernameField && usernameFields.length > 0) {
      bestUsernameField = usernameFields[0];
    }
    
    if (bestUsernameField) {
      loginForms.push({
        usernameField: bestUsernameField,
        passwordField,
        form: passwordField.closest('form') || null,
      });
    }
  });
  
  if (loginForms.length === 0) {
    const allForms = root.querySelectorAll('form');
    allForms.forEach((form) => {
      const formPasswordFields = findPasswordFields(form);
      const formUsernameFields = findUsernameFields(form);
      
      if (formPasswordFields.length > 0) {
        formPasswordFields.forEach((passwordField) => {
          const usernameField = formUsernameFields[0] || null;
          if (usernameField) {
            loginForms.push({
              usernameField,
              passwordField,
              form,
            });
          }
        });
      }
    });
  }
  
  debugLog(`找到 ${loginForms.length} 个登录表单`);
  return loginForms;
}

function calculateFieldDistance(field1, field2) {
  const rect1 = field1.getBoundingClientRect();
  const rect2 = field2.getBoundingClientRect();
  
  const centerX1 = rect1.left + rect1.width / 2;
  const centerY1 = rect1.top + rect1.height / 2;
  const centerX2 = rect2.left + rect2.width / 2;
  const centerY2 = rect2.top + rect2.height / 2;
  
  return Math.sqrt(
    Math.pow(centerX1 - centerX2, 2) + Math.pow(centerY1 - centerY2, 2)
  );
}

function findAllLoginForms() {
  let allForms = findLoginForms(document);
  
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const iframeForms = findLoginForms(iframeDoc);
        allForms = allForms.concat(iframeForms);
      }
    } catch (e) {
      debugLog('无法访问 iframe (跨域限制)');
    }
  });
  
  const shadowHosts = document.querySelectorAll('*');
  shadowHosts.forEach((host) => {
    if (host.shadowRoot) {
      const shadowForms = findLoginForms(host.shadowRoot);
      allForms = allForms.concat(shadowForms);
    }
  });
  
  return allForms;
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function triggerReactEvents(element, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }
  
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  
  element.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    key: value[0] || '',
    code: value.charCodeAt(0) || 0,
  }));
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
  
  element.dispatchEvent(new Event('change', { bubbles: true }));
  
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: value,
    dataTransfer: null,
    isComposing: false,
  }));
  
  element.dispatchEvent(new KeyboardEvent('keyup', {
    bubbles: true,
    key: value[value.length - 1] || '',
  }));
  
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function fillInput(element, value) {
  if (!element) return false;
  
  try {
    element.focus();
    
    triggerReactEvents(element, value);
    
    if (element.value !== value) {
      setNativeValue(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    debugLog(`已填充字段: ${element.name || element.id || element.placeholder || 'unknown'}`);
    return true;
  } catch (error) {
    debugLog('填充字段失败:', error);
    return false;
  }
}

function createAutofillButton(usernameField, passwordField, credentials) {
  const container = document.createElement('div');
  container.className = 'pm-autofill-container';
  container.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: #1a1a2e;
    border: 1px solid rgba(71, 85, 105, 0.4);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    max-height: 250px;
    overflow-y: auto;
    width: 280px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px 12px;
    font-size: 12px;
    color: #94a3b8;
    border-bottom: 1px solid rgba(71, 85, 105, 0.2);
    background: rgba(30, 41, 59, 0.8);
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;
  header.innerHTML = `
    <span>选择要填充的凭证 (${credentials.length})</span>
    <button class="pm-close-btn" style="background:none;border:none;color:#64748b;cursor:pointer;padding:4px;">✕</button>
  `;
  container.appendChild(header);
  
  const closeBtn = header.querySelector('.pm-close-btn');
  closeBtn.onclick = () => container.remove();
  
  credentials.forEach((cred) => {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: background 0.2s;
    `;
    
    item.onmouseover = () => {
      item.style.background = 'rgba(67, 97, 238, 0.2)';
    };
    item.onmouseout = () => {
      item.style.background = 'transparent';
    };
    
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 13px; font-weight: 600; color: #ffffff;';
    title.textContent = cred.title;
    
    const username = document.createElement('div');
    username.style.cssText = 'font-size: 11px; color: #94a3b8;';
    username.textContent = cred.username;
    
    item.appendChild(title);
    item.appendChild(username);
    
    item.onclick = () => {
      fillInput(usernameField, cred.username);
      fillInput(passwordField, cred.password);
      container.remove();
    };
    
    container.appendChild(item);
  });
  
  return container;
}

function positionContainer(container, targetField) {
  const rect = targetField.getBoundingClientRect();
  const containerHeight = Math.min(250, 50 + (container.children.length - 1) * 40);
  const spaceBelow = window.innerHeight - rect.bottom;
  
  if (spaceBelow >= containerHeight) {
    container.style.top = `${rect.bottom + 4}px`;
  } else {
    container.style.top = `${rect.top - containerHeight - 4}px`;
  }
  
  container.style.left = `${rect.left}px`;
  
  const containerRect = container.getBoundingClientRect();
  if (containerRect.right > window.innerWidth) {
    container.style.left = `${window.innerWidth - containerRect.width - 16}px`;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('收到消息:', request.action);
  
  if (request.action === 'getLoginForms') {
    const forms = findAllLoginForms();
    sendResponse({
      count: forms.length,
      forms: forms.map((f) => ({
        hasUsername: !!f.usernameField,
        hasPassword: !!f.passwordField,
        usernameType: f.usernameField?.type || null,
        passwordType: f.passwordField?.type || null,
      })),
    });
  }
  
  if (request.action === 'autofill') {
    const forms = findAllLoginForms();
    debugLog(`找到 ${forms.length} 个表单用于自动填充`);
    
    let filledCount = 0;
    
    forms.forEach(({ usernameField, passwordField }) => {
      if (request.credentials && request.credentials.length > 0) {
        if (request.credentials.length === 1) {
          const cred = request.credentials[0];
          const usernameFilled = fillInput(usernameField, cred.username);
          const passwordFilled = fillInput(passwordField, cred.password);
          
          if (usernameFilled || passwordFilled) {
            filledCount++;
          }
        } else {
          const existingContainer = document.querySelector('.pm-autofill-container');
          if (existingContainer) existingContainer.remove();
          
          const container = createAutofillButton(
            usernameField,
            passwordField,
            request.credentials
          );
          document.body.appendChild(container);
          positionContainer(container, passwordField);
        }
      }
    });
    
    sendResponse({ success: true, filledCount });
  }
  
  if (request.action === 'checkPage') {
    const forms = findAllLoginForms();
    sendResponse({
      hasLoginForm: forms.length > 0,
      formCount: forms.length,
      url: window.location.href,
      domain: getCurrentDomain(),
    });
  }
  
  return true;
});

function addAutofillIcons() {
  const forms = findAllLoginForms();
  
  forms.forEach(({ usernameField, passwordField }) => {
    const parent = passwordField.parentElement;
    if (!parent) return;
    
    const existingIcon = parent.querySelector('.pm-autofill-icon');
    if (existingIcon) return;
    
    const icon = document.createElement('div');
    icon.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4361ee" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    `;
    icon.className = 'pm-autofill-icon';
    icon.style.cssText = `
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      background: rgba(67, 97, 238, 0.1);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    icon.title = '密码管理器 - 点击自动填充';
    
    if (parent.style.position !== 'relative') {
      parent.style.position = 'relative';
    }
    parent.appendChild(icon);
    
    icon.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      debugLog('点击自动填充图标');
      chrome.runtime.sendMessage({ action: 'triggerAutofill' });
    };
  });
}

function initAutofill() {
  debugLog('初始化自动填充模块');
  addAutofillIcons();
  
  let lastCheckTime = 0;
  const MIN_CHECK_INTERVAL = 500;
  
  const observer = new MutationObserver((mutations) => {
    const now = Date.now();
    if (now - lastCheckTime < MIN_CHECK_INTERVAL) return;
    
    const hasRelevantChanges = mutations.some((mutation) => {
      if (mutation.type === 'childList') {
        return Array.from(mutation.addedNodes).some((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node;
            return (
              element.querySelector &&
              (element.querySelector('input') || element.tagName === 'INPUT')
            );
          }
          return false;
        });
      }
      return false;
    });
    
    if (hasRelevantChanges) {
      lastCheckTime = now;
      setTimeout(addAutofillIcons, 100);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  window.addEventListener('load', () => {
    setTimeout(addAutofillIcons, 500);
  });
  
  window.addEventListener('hashchange', () => {
    setTimeout(addAutofillIcons, 300);
  });
  
  setInterval(() => {
    const forms = findAllLoginForms();
    const existingIcons = document.querySelectorAll('.pm-autofill-icon');
    
    if (forms.length > existingIcons.length) {
      addAutofillIcons();
    }
  }, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutofill);
} else {
  initAutofill();
}

debugLog('内容脚本已加载');
