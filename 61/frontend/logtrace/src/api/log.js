import request from '../utils/request'

export const getDeviceLogsApi = (params) => {
  return request({
    url: '/api/logs/device',
    method: 'get',
    params
  })
}

export const getOfflineLogsApi = (params) => {
  return request({
    url: '/api/logs/offline',
    method: 'get',
    params
  })
}

export const getAuditLogsApi = (params) => {
  return request({
    url: '/api/logs/audit',
    method: 'get',
    params
  })
}

export const getTraceAnalysisApi = (deviceId, logId) => {
  return request({
    url: `/api/logs/trace/${deviceId}/${logId}`,
    method: 'get'
  })
}

export const exportLogsApi = (params) => {
  return request({
    url: '/api/logs/export',
    method: 'get',
    params,
    responseType: 'blob'
  })
}
