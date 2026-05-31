import request from './request'

export const getActiveEnvironment = () => {
  return request({
    url: '/environment/active',
    method: 'get',
  })
}

export const getEnvironmentList = () => {
  return request({
    url: '/environment/list',
    method: 'get',
  })
}

export const createEnvironment = (data) => {
  return request({
    url: '/environment/create',
    method: 'post',
    data,
  })
}

export const updateEnvironment = (id, data) => {
  return request({
    url: `/environment/update/${id}`,
    method: 'put',
    data,
  })
}

export const activateEnvironment = (id) => {
  return request({
    url: `/environment/activate/${id}`,
    method: 'post',
  })
}

export const deleteEnvironment = (id) => {
  return request({
    url: `/environment/delete/${id}`,
    method: 'delete',
  })
}

export const getClientConfig = () => {
  return request({
    url: '/environment/client-config',
    method: 'get',
  })
}
