import request from './request'

export const grantPermission = (documentId, data) => {
  return request({
    url: `/permission/document/${documentId}`,
    method: 'post',
    data,
  })
}

export const getDocumentPermissions = (documentId) => {
  return request({
    url: `/permission/document/${documentId}`,
    method: 'get',
  })
}

export const revokePermission = (permissionId) => {
  return request({
    url: `/permission/${permissionId}`,
    method: 'delete',
  })
}

export const getMyPermissions = () => {
  return request({
    url: '/permission/my',
    method: 'get',
  })
}

export const batchGrantPermissions = (data) => {
  return request({
    url: '/permission/batch',
    method: 'post',
    data,
  })
}
