const ipUtil = require('ip');

function getClientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff && xff.split(',')[0].trim() !== '') {
    return xff.split(',')[0].trim();
  }

  const xRealIP = req.headers['x-real-ip'];
  if (xRealIP) {
    return xRealIP;
  }

  const conn = req.connection;
  if (conn && conn.remoteAddress) {
    return conn.remoteAddress;
  }

  const socket = req.socket;
  if (socket && socket.remoteAddress) {
    return socket.remoteAddress;
  }

  return '127.0.0.1';
}

function parseIPRange(range) {
  if (range.includes('/')) {
    const [subnet, mask] = range.split('/');
    return {
      type: 'cidr',
      subnet: subnet.trim(),
      mask: parseInt(mask),
      network: ipUtil.cidrSubnet(range)
    };
  } else if (range.includes('-')) {
    const [start, end] = range.split('-');
    return {
      type: 'range',
      start: start.trim(),
      end: end.trim(),
      startLong: ipUtil.toLong(start.trim()),
      endLong: ipUtil.toLong(end.trim())
    };
  } else {
    return {
      type: 'single',
      ip: range.trim(),
      ipLong: ipUtil.toLong(range.trim())
    };
  }
}

function isIPInRange(ip, parsedRange) {
  try {
    const ipLong = ipUtil.toLong(ip);

    switch (parsedRange.type) {
      case 'cidr':
        return parsedRange.network.contains(ip);

      case 'range':
        return ipLong >= parsedRange.startLong && ipLong <= parsedRange.endLong;

      case 'single':
        return ipLong === parsedRange.ipLong;

      default:
        return false;
    }
  } catch (error) {
    return false;
  }
}

function hashIP(ip) {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

module.exports = {
  getClientIP,
  parseIPRange,
  isIPInRange,
  hashIP
};
