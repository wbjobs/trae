import request from './request'

export const getWatermarkConfigs = () => {
  return request({
    url: '/watermark/configs',
    method: 'get',
  })
}

export const createWatermarkConfig = (data) => {
  return request({
    url: '/watermark/configs',
    method: 'post',
    data,
  })
}

export const updateWatermarkConfig = (id, data) => {
  return request({
    url: `/watermark/configs/${id}`,
    method: 'put',
    data,
  })
}

export const deleteWatermarkConfig = (id) => {
  return request({
    url: `/watermark/configs/${id}`,
    method: 'delete',
  })
}

export const getDefaultWatermark = () => {
  return request({
    url: '/watermark/default',
    method: 'get',
  })
}

export const generateWatermark = (documentId, configId) => {
  return request({
    url: `/watermark/generate/${documentId}`,
    method: 'post',
    data: { configId },
  })
}
