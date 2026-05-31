import Router from 'koa-router'
import { User } from '../models/User.js'
import { Role } from '../models/Role.js'
import { generateToken } from '../middleware/auth.js'
import LogService from '../services/logService.js'
import { Op } from 'sequelize'

const router = new Router()

router.post('/login', async (ctx) => {
  const { username, password } = ctx.request.body

  if (!username || !password) {
    ctx.body = {
      code: 400,
      message: '用户名和密码不能为空',
      data: null
    }
    return
  }

  const user = await User.findOne({ where: { username } })

  if (!user || !user.comparePassword(password)) {
    await LogService.addAuditLog({
      username,
      action: 'login',
      module: 'auth',
      description: `用户登录失败: 用户名或密码错误`,
      ip: ctx.ip,
      success: false
    })

    ctx.body = {
      code: 401,
      message: '用户名或密码错误',
      data: null
    }
    return
  }

  if (user.status !== 1) {
    ctx.body = {
      code: 403,
      message: '账号已被禁用',
      data: null
    }
    return
  }

  const token = generateToken(user.toJSON())

  await LogService.addAuditLog({
    userId: user.id,
    username: user.username,
    action: 'login',
    module: 'auth',
    description: '用户登录成功',
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '登录成功',
    data: {
      token,
      userInfo: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        factory: user.factory
      }
    }
  }
})

router.post('/logout', async (ctx) => {
  const user = ctx.state.user

  if (user) {
    await LogService.addAuditLog({
      userId: user.id,
      username: user.username,
      action: 'logout',
      module: 'auth',
      description: '用户登出',
      ip: ctx.ip,
      success: true
    })
  }

  ctx.body = {
    code: 200,
    message: '登出成功',
    data: null
  }
})

router.get('/userInfo', async (ctx) => {
  const user = ctx.state.user

  const dbUser = await User.findByPk(user.id)

  if (!dbUser) {
    ctx.status = 404
    ctx.body = {
      code: 404,
      message: '用户不存在',
      data: null
    }
    return
  }

  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      id: dbUser.id,
      username: dbUser.username,
      realName: dbUser.realName,
      email: dbUser.email,
      phone: dbUser.phone,
      role: dbUser.role,
      factory: dbUser.factory
    }
  }
})

router.get('/users', async (ctx) => {
  const { page = 1, pageSize = 10, username, role, factory } = ctx.query

  const where = {}
  if (username) {
    where.username = { [Op.like]: `%${username}%` }
  }
  if (role) {
    where.role = role
  }
  if (factory) {
    where.factory = factory
  }

  const { count, rows } = await User.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: parseInt(pageSize),
    offset: (parseInt(page) - 1) * parseInt(pageSize)
  })

  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      list: rows.map(r => ({
        id: r.id,
        username: r.username,
        realName: r.realName,
        email: r.email,
        phone: r.phone,
        role: r.role,
        factory: r.factory,
        status: r.status,
        createTime: r.createdAt
      })),
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }
  }
})

router.post('/users', async (ctx) => {
  const userData = ctx.request.body

  const existingUser = await User.findOne({ where: { username: userData.username } })
  if (existingUser) {
    ctx.body = {
      code: 400,
      message: '用户名已存在',
      data: null
    }
    return
  }

  const user = await User.create(userData)

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'create',
    module: 'user',
    target: userData.username,
    description: `创建用户: ${userData.username}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '创建成功',
    data: user.toJSON()
  }
})

router.put('/users/:id', async (ctx) => {
  const { id } = ctx.params
  const updates = ctx.request.body

  if (updates.password) {
    updates.password = updates.password
  } else {
    delete updates.password
  }

  await User.update(updates, { where: { id } })

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'update',
    module: 'user',
    target: id,
    description: `更新用户信息: ${id}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '更新成功',
    data: null
  }
})

router.delete('/users/:id', async (ctx) => {
  const { id } = ctx.params

  await User.destroy({ where: { id } })

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'delete',
    module: 'user',
    target: id,
    description: `删除用户: ${id}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '删除成功',
    data: null
  }
})

router.get('/roles', async (ctx) => {
  const roles = await Role.findAll({
    order: [['createdAt', 'DESC']]
  })

  ctx.body = {
    code: 200,
    message: 'success',
    data: roles.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      type: r.type,
      description: r.description,
      permissions: r.permissions,
      userCount: Math.floor(Math.random() * 50) + 5,
      permissionCount: r.permissions?.length || 0,
      createdAt: r.createdAt
    }))
  }
})

router.post('/roles', async (ctx) => {
  const roleData = ctx.request.body

  const role = await Role.create(roleData)

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'create',
    module: 'role',
    target: roleData.name,
    description: `创建角色: ${roleData.name}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '创建成功',
    data: role.toJSON()
  }
})

router.put('/roles/:id', async (ctx) => {
  const { id } = ctx.params
  const updates = ctx.request.body

  await Role.update(updates, { where: { id } })

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'update',
    module: 'role',
    target: id,
    description: `更新角色: ${id}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '更新成功',
    data: null
  }
})

router.delete('/roles/:id', async (ctx) => {
  const { id } = ctx.params

  await Role.destroy({ where: { id } })

  await LogService.addAuditLog({
    userId: ctx.state.user?.id,
    username: ctx.state.user?.username,
    action: 'delete',
    module: 'role',
    target: id,
    description: `删除角色: ${id}`,
    ip: ctx.ip,
    success: true
  })

  ctx.body = {
    code: 200,
    message: '删除成功',
    data: null
  }
})

router.get('/permissions/tree', async (ctx) => {
  const permissionTree = [
    {
      id: 'device',
      label: '设备管理',
      icon: 'Monitor',
      type: 'module',
      children: [
        { id: 'device:view', label: '查看设备', icon: 'View', type: 'button' },
        { id: 'device:control', label: '控制设备', icon: 'Operation', type: 'button' },
        { id: 'device:create', label: '新增设备', icon: 'Plus', type: 'button' },
        { id: 'device:delete', label: '删除设备', icon: 'Delete', type: 'button' }
      ]
    },
    {
      id: 'log',
      label: '日志管理',
      icon: 'Document',
      type: 'module',
      children: [
        { id: 'log:view', label: '查看日志', icon: 'View', type: 'button' },
        { id: 'log:export', label: '导出日志', icon: 'Download', type: 'button' },
        { id: 'log:trace', label: '离线溯源', icon: 'Search', type: 'button' }
      ]
    },
    {
      id: 'user',
      label: '用户管理',
      icon: 'User',
      type: 'module',
      children: [
        { id: 'user:view', label: '查看用户', icon: 'View', type: 'button' },
        { id: 'user:create', label: '新增用户', icon: 'Plus', type: 'button' },
        { id: 'user:update', label: '编辑用户', icon: 'Edit', type: 'button' },
        { id: 'user:delete', label: '删除用户', icon: 'Delete', type: 'button' }
      ]
    },
    {
      id: 'auth',
      label: '权限管理',
      icon: 'Lock',
      type: 'module',
      children: [
        { id: 'auth:role:view', label: '查看角色', icon: 'View', type: 'button' },
        { id: 'auth:role:create', label: '新增角色', icon: 'Plus', type: 'button' },
        { id: 'auth:role:update', label: '编辑角色', icon: 'Edit', type: 'button' },
        { id: 'auth:role:delete', label: '删除角色', icon: 'Delete', type: 'button' }
      ]
    }
  ]

  ctx.body = {
    code: 200,
    message: 'success',
    data: permissionTree
  }
})

router.get('/logs', async (ctx) => {
  const result = await LogService.getAuditLogs(ctx.query)
  ctx.body = {
    code: 200,
    message: 'success',
    data: result
  }
})

export default router
