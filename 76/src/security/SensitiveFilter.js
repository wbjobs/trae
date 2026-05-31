class SensitiveFilter {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.sensitiveWindowTitles = [
      /password/i,
      /login/i,
      /signin/i,
      /登录/i,
      /密码/i,
      /银行/i,
      /网银/i,
      /支付宝/i,
      /微信支付/i,
      /支付密码/i,
      /Pin/i,
      /PIN/i,
      /Code.*Access/i,
      /Authentication/i,
      /OTP/i,
      /验证码/i,
      /CVV/i,
      /CVC/i
    ];

    this.sensitiveProcesses = [
      /bank/i,
      /password/i,
      /vault/i,
      /keepass/i,
      /1password/i,
      /lastpass/i,
      /bitwarden/i
    ];

    this.sensitiveKeywords = [
      'password', 'passwd', 'pwd',
      'token', 'secret', 'key',
      'api_key', 'apikey',
      'private_key', 'privkey',
      'ssn', 'social_security',
      'credit_card', 'card_number',
      'cvv', 'cvc', 'expiry',
      '身份证', '银行卡号', '支付密码'
    ];

    this.inSensitiveContext = false;
    this.currentWindow = null;
    this.maskedCharacter = '*';
  }

  checkWindow(windowInfo) {
    if (!this.enabled || !windowInfo) {
      this.inSensitiveContext = false;
      return false;
    }

    this.currentWindow = windowInfo;
    const title = windowInfo.title || '';
    const owner = windowInfo.owner || '';

    const isTitleSensitive = this.sensitiveWindowTitles.some(pattern => pattern.test(title));
    const isProcessSensitive = this.sensitiveProcesses.some(pattern => pattern.test(owner));

    this.inSensitiveContext = isTitleSensitive || isProcessSensitive;

    return this.inSensitiveContext;
  }

  filterKeyEvent(event) {
    if (!this.enabled && !this.inSensitiveContext) {
      return event;
    }

    if (this.inSensitiveContext) {
      return {
        ...event,
        keyName: this.maskedCharacter,
        isSensitive: true,
        originalKey: event.keyName
      };
    }

    return event;
  }

  filterText(text) {
    if (!this.enabled) return text;

    if (this.inSensitiveContext) {
      return this.maskedCharacter.repeat(Math.min(text.length, 20));
    }

    let filtered = text;
    this.sensitiveKeywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      filtered = filtered.replace(regex, this.maskedCharacter.repeat(keyword.length));
    });

    return filtered;
  }

  isInSensitiveContext() {
    return this.inSensitiveContext;
  }

  addSensitiveTitle(pattern) {
    if (pattern instanceof RegExp) {
      this.sensitiveWindowTitles.push(pattern);
    } else if (typeof pattern === 'string') {
      this.sensitiveWindowTitles.push(new RegExp(pattern, 'i'));
    }
  }

  addSensitiveProcess(pattern) {
    if (pattern instanceof RegExp) {
      this.sensitiveProcesses.push(pattern);
    } else if (typeof pattern === 'string') {
      this.sensitiveProcesses.push(new RegExp(pattern, 'i'));
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      inSensitiveContext: this.inSensitiveContext,
      currentWindow: this.currentWindow
    };
  }
}

module.exports = SensitiveFilter;
