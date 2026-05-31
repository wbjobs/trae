class Validator {
  constructor() {
    this.rules = {};
  }

  validate(data, schema) {
    const errors = [];
    const validated = {};

    Object.entries(schema).forEach(([field, rules]) => {
      const value = data[field];
      const fieldErrors = this.validateField(field, value, rules);
      
      if (fieldErrors.length > 0) {
        errors.push(...fieldErrors);
      } else if (value !== undefined) {
        validated[field] = value;
      } else if (rules.default !== undefined) {
        validated[field] = rules.default;
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      data: validated
    };
  }

  validateField(field, value, rules) {
    const errors = [];

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push({ field, message: `${field} 为必填项` });
      return errors;
    }

    if (value === undefined || value === null) {
      return errors;
    }

    if (rules.type) {
      const typeValid = this.checkType(value, rules.type);
      if (!typeValid) {
        errors.push({ field, message: `${field} 类型错误，应为 ${rules.type}` });
        return errors;
      }
    }

    if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
      errors.push({ field, message: `${field} 最少需要 ${rules.minLength} 个字符` });
    }

    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      errors.push({ field, message: `${field} 最多允许 ${rules.maxLength} 个字符` });
    }

    if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
      errors.push({ field, message: `${field} 不能小于 ${rules.min}` });
    }

    if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
      errors.push({ field, message: `${field} 不能大于 ${rules.max}` });
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({ field, message: `${field} 必须是以下值之一: ${rules.enum.join(', ')}` });
    }

    if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
      errors.push({ field, message: `${field} 格式不正确` });
    }

    if (rules.custom && typeof rules.custom === 'function') {
      const customError = rules.custom(value);
      if (customError) {
        errors.push({ field, message: customError });
      }
    }

    return errors;
  }

  checkType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'integer':
        return typeof value === 'number' && !isNaN(value) && Number.isInteger(value);
      case 'email':
        return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'url':
        return typeof value === 'string' && /^https?:\/\//.test(value);
      case 'doi':
        return typeof value === 'string' && /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(value);
      default:
        return true;
    }
  }

  sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
      .trim()
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[<>]/g, '');
  }

  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    });
    return sanitized;
  }
}

module.exports = new Validator();
