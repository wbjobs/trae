import request from './request'

export const getSyncStatus = () => {
  return request({
    url: '/sync/status',
    method: 'get',
  })
}

export const pushToCloud = (type) => {
  return request({
    url: '/sync/push',
    method: 'post',
    data: { type },
  })
}

export const pullFromCloud = (type) => {
  return request({
    url: '/sync/pull',
    method: 'post',
    data: { type },
  })
}

export const uploadOfflineLogs = (logs) => {
  return request({
    url: '/sync/offline-logs',
    method: 'post',
    data: { logs },
  })
}

export const getSyncRecords = (params) => {
  return request({
    url: '/sync/records',
    method: 'get',
    params,
  })
}
