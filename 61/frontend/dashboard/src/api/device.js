import request from '../utils/request'

export const getDeviceListApi = (params) => {
  return request({
    url: '/api/devices',
    method: 'get',
    params
  })
}

export const getDeviceStatsApi = (params) => {
  return request({
    url: '/api/devices/stats',
    method: 'get',
    params
  })
}

export const getDeviceDetailApi = (deviceId) => {
  return request({
    url: `/api/devices/${deviceId}`,
    method: 'get'
  })
}

export const getDeviceMetricsApi = (deviceId, params) => {
  return request({
    url: `/api/devices/${deviceId}/metrics`,
    method: 'get',
    params
  })
}

export const controlDeviceApi = (deviceId, data) => {
  return request({
    url: `/devices/${deviceId}/control`,
    method: 'post',
    data
  })
}

export const getDeviceCacheApi = (deviceId) => {
  return request({
    url: `/devices/${deviceId}/cache`,
    method: 'get'
  })
}

export const clearDeviceCacheApi = (deviceId) => {
  return request({
    url: `/devices/${deviceId}/cache`,
    method: 'delete'
  })
}

export const resendDeviceCacheApi = (deviceId) => {
  return request({
    url: `/devices/${deviceId}/cache/resend`,
    method: 'post'
  })
}

export const getCacheStatsApi = () => {
  return request({
    url: `/devices/cache/stats`,
    method: 'get'
  })
}

export const getFactoryListApi = () => {
  return request({
    url: '/api/factories',
    method: 'get'
  })
}
