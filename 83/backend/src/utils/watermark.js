const crypto = require('crypto');

const generateTextWatermark = (text, options = {}) => {
  const {
    fontSize = 14,
    opacity = 0.3,
    angle = -30,
    color = '#000000',
    position = 'full',
  } = options;

  return {
    type: 'text',
    content: text,
    fontSize,
    opacity,
    angle,
    color,
    position,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
};

const generateUserWatermark = (user, document, options = {}) => {
  const template = options.template || '${username} - ${date} - ${docTitle}';
  const date = new Date().toLocaleDateString('zh-CN');
  
  const content = template
    .replace('${username}', user.realName || user.username)
    .replace('${date}', date)
    .replace('${docTitle}', document.title)
    .replace('${department}', user.department || '')
    .replace('${docId}', document.doc_uuid || '');

  return generateTextWatermark(content, options);
};

const generateInvisibleWatermark = (data) => {
  const watermarkData = {
    ...data,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  
  const encoded = Buffer.from(JSON.stringify(watermarkData)).toString('base64');
  const hash = crypto.createHash('sha256').update(encoded).digest('hex');
  
  return {
    type: 'invisible',
    data: encoded,
    hash,
    version: '1.0',
  };
};

const extractInvisibleWatermark = (encodedData) => {
  try {
    const decoded = Buffer.from(encodedData, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (err) {
    throw new Error('无法解析隐水印数据');
  }
};

const applyWatermarkToText = (text, watermark) => {
  const watermarkStr = `\n\n[WATERMARK:${watermark.id}:${watermark.content}:${Date.now()}]`;
  return text + watermarkStr;
};

const detectTampering = (originalText, currentText) => {
  const watermarkRegex = /\[WATERMARK:([^:]+):([^:]+):(\d+)\]$/;
  
  const originalMatch = originalText.match(watermarkRegex);
  const currentMatch = currentText.match(watermarkRegex);
  
  if (!originalMatch) {
    return { tampered: true, reason: '原始水印不存在' };
  }
  
  if (!currentMatch) {
    return { tampered: true, reason: '水印已被移除' };
  }
  
  const [, origId, origContent, origTime] = originalMatch;
  const [, currId, currContent, currTime] = currentMatch;
  
  if (origId !== currId) {
    return { tampered: true, reason: '水印ID不匹配，可能被替换' };
  }
  
  if (origContent !== currContent) {
    return { tampered: true, reason: '水印内容已被修改' };
  }
  
  const originalClean = originalText.replace(watermarkRegex, '');
  const currentClean = currentText.replace(watermarkRegex, '');
  
  if (originalClean !== currentClean) {
    return { tampered: true, reason: '文档内容已被修改' };
  }
  
  return { tampered: false };
};

const generateQRWatermark = (data, size = 128) => {
  const qrData = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    type: 'qr',
    data: qrData,
    size,
    id: crypto.randomUUID(),
  };
};

module.exports = {
  generateTextWatermark,
  generateUserWatermark,
  generateInvisibleWatermark,
  extractInvisibleWatermark,
  applyWatermarkToText,
  detectTampering,
  generateQRWatermark,
};
