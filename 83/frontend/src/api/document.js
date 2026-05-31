import request from './request'

export const uploadDocument = (formData, onProgress) => {
  return request({
    url: '/document/upload',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total))
      }
    },
  })
}

export const getDocumentList = (params) => {
  return request({
    url: '/document/list',
    method: 'get',
    params,
  })
}

export const getDocumentDetail = (id) => {
  return request({
    url: `/document/${id}`,
    method: 'get',
  })
}

export const downloadDocument = (id) => {
  return request({
    url: `/document/${id}/download`,
    method: 'get',
    responseType: 'blob',
  })
}

export const verifyDocumentIntegrity = (id) => {
  return request({
    url: `/document/${id}/verify-integrity`,
    method: 'post',
  })
}

export const updateDocument = (id, data) => {
  return request({
    url: `/document/${id}`,
    method: 'put',
    data,
  })
}

export const deleteDocument = (id) => {
  return request({
    url: `/document/${id}`,
    method: 'delete',
  })
}
