import request from '../utils/request'

export const getUserListApi = (params) => {
  return request({
    url: '/api/auth/users',
    method: 'get',
    params
  })
}

export const saveUserApi = (data) => {
  return request({
    url: '/api/auth/users',
    method: 'post',
    data
  })
}

export const updateUserApi = (id, data) => {
  return request({
    url: `/api/auth/users/${id}`,
    method: 'put',
    data
  })
}

export const deleteUserApi = (id) => {
  return request({
    url: `/api/auth/users/${id}`,
    method: 'delete'
  })
}

export const getRoleListApi = () => {
  return request({
    url: '/api/auth/roles',
    method: 'get'
  })
}

export const saveRoleApi = (data) => {
  return request({
    url: '/api/auth/roles',
    method: 'post',
    data
  })
}

export const updateRoleApi = (id, data) => {
  return request({
    url: `/api/auth/roles/${id}`,
    method: 'put',
    data
  })
}

export const deleteRoleApi = (id) => {
  return request({
    url: `/api/auth/roles/${id}`,
    method: 'delete'
  })
}

export const getPermissionTreeApi = () => {
  return request({
    url: '/api/auth/permissions/tree',
    method: 'get'
  })
}

export const getAuthLogsApi = (params) => {
  return request({
    url: '/api/auth/logs',
    method: 'get',
    params
  })
}

export const assignRoleApi = (userId, roleId) => {
  return request({
    url: `/api/auth/users/${userId}/role`,
    method: 'put',
    data: { roleId }
  })
}
