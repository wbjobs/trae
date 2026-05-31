import request from '../utils/request'

export const loginApi = (data) => {
  return request({
    url: '/api/auth/login',
    method: 'post',
    data
  })
}

export const getUserInfoApi = () => {
  return request({
    url: '/api/auth/userInfo',
    method: 'get'
  })
}

export const logoutApi = () => {
  return request({
    url: '/api/auth/logout',
    method: 'post'
  })
}
