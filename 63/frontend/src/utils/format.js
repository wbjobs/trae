export function formatAuthors(authors, maxShow = 3) {
  if (!authors || authors.length === 0) return '';
  
  const names = authors.map(a => a.fullName || `${a.lastName} ${a.firstName}`.trim());
  
  if (names.length <= maxShow) {
    return names.join(', ');
  }
  
  return names.slice(0, maxShow).join(', ') + ` 等 ${names.length} 人`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

export function truncateText(text, maxLength = 100) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text).then(() => {
    return true;
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  });
}

export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
