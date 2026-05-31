import request from './request'

export const login = (data) => {
  return request({
    url: '/auth/login',
    method: 'post',
    data,
  })
}

export const logout = () => {
  return request({
    url: '/auth/logout',
    method: 'post',
  })
}

export const getUserInfo = () => {
  return request({
    url: '/auth/profile',
    method: 'get',
  })
}

export const changePassword = (data) => {
  return request({
    url: '/auth/password',
    method: 'put',
    data,
  })
}

export const getUserList = (params) => {
  return request({
    url: '/auth/users',
    method: 'get',
    params,
  })
}

export const createUser = (data) => {
  return request({
    url: '/auth/users',
    method: 'post',
    data,
  })
}

export const updateUser = (id, data) => {
  return request({
    url: `/auth/users/${id}`,
    method: 'put',
    data,
  })
}

export const deleteUser = (id) => {
  return request({
    url: `/auth/users/${id}`,
    method: 'delete',
  })
}
