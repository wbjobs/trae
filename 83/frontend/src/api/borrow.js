import request from './request'

export const applyBorrow = (data) => {
  return request({
    url: '/borrow/apply',
    method: 'post',
    data,
  })
}

export const getMyBorrows = (params) => {
  return request({
    url: '/borrow/my',
    method: 'get',
    params,
  })
}

export const returnBorrow = (id) => {
  return request({
    url: `/borrow/return/${id}`,
    method: 'post',
  })
}

export const extendBorrow = (id, data) => {
  return request({
    url: `/borrow/extend/${id}`,
    method: 'post',
    data,
  })
}

export const getBorrowRules = () => {
  return request({
    url: '/borrow/rules',
    method: 'get',
  })
}

export const getOverdueBorrows = (params) => {
  return request({
    url: '/borrow/overdue',
    method: 'get',
    params,
  })
}

export const getPendingBorrows = (params) => {
  return request({
    url: '/borrow/pending',
    method: 'get',
    params,
  })
}

export const approveBorrow = (id, data) => {
  return request({
    url: `/borrow/approve/${id}`,
    method: 'post',
    data,
  })
}

export const checkBorrowAccess = (documentId) => {
  return request({
    url: `/borrow/check-access/${documentId}`,
    method: 'get',
  })
}
