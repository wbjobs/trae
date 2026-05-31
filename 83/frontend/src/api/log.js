import request from './request'

export const getLogList = (params) => {
  return request({
    url: '/log/list',
    method: 'get',
    params,
  })
}

export const getDocumentTrace = (documentId, level) => {
  return request({
    url: `/log/document/${documentId}/trace`,
    method: 'get',
    params: { level },
  })
}

export const generateTraceReport = (data) => {
  return request({
    url: '/log/report',
    method: 'post',
    data,
  })
}

export const getLogStatistics = (params) => {
  return request({
    url: '/log/statistics',
    method: 'get',
    params,
  })
}

export const exportLogs = (params) => {
  return request({
    url: '/log/export',
    method: 'get',
    params,
    responseType: 'blob',
  })
}

export const exportLogsAsFormat = (params, format) => {
  return request({
    url: '/log/export',
    method: 'get',
    params: { ...params, format },
    responseType: 'blob',
  })
}

export const checkSuspiciousActivity = (userId, timeWindowHours) => {
  return request({
    url: `/log/suspicious/${userId}`,
    method: 'get',
    params: { timeWindowHours },
  })
}
