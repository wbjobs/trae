import axios from 'axios'

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000
})

let authToken = null

const test = async (name, fn) => {
  console.log(`\n[测试] ${name}`)
  try {
    await fn()
    console.log(`✓ ${name} - 通过`)
    return true
  } catch (error) {
    console.log(`✗ ${name} - 失败: ${error.message}`)
    return false
  }
}

const runTests = async () => {
  console.log('========================================')
  console.log('工业物联网平台 API 测试')
  console.log(`测试地址: ${BASE_URL}`)
  console.log('========================================')

  const results = []

  results.push(await test('健康检查', async () => {
    const res = await api.get('/api/health')
    if (res.data.code !== 200) throw new Error('健康检查失败')
    console.log('  状态:', res.data.data.status)
  }))

  results.push(await test('用户登录', async () => {
    const res = await api.post('/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    })
    if (res.data.code !== 200) throw new Error(res.data.message)
    authToken = res.data.data.token
    console.log('  Token:', authToken.substring(0, 20) + '...')
  }))

  if (authToken) {
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`

    results.push(await test('获取用户信息', async () => {
      const res = await api.get('/api/auth/info')
      if (res.data.code !== 200) throw new Error(res.data.message)
      console.log('  用户名:', res.data.data.username)
    }))

    results.push(await test('获取设备列表', async () => {
      const res = await api.get('/api/devices', {
        params: { page: 1, pageSize: 10 }
      })
      if (res.data.code !== 200) throw new Error(res.data.message)
      console.log('  设备数量:', res.data.data.list?.length || 0)
    }))

    results.push(await test('获取设备统计', async () => {
      const res = await api.get('/api/devices/stats')
      if (res.data.code !== 200) throw new Error(res.data.message)
      console.log('  在线设备:', res.data.data.onlineCount)
      console.log('  离线设备:', res.data.data.offlineCount)
    }))

    results.push(await test('获取厂区列表', async () => {
      const res = await api.get('/api/factories')
      if (res.data.code !== 200) throw new Error(res.data.message)
      console.log('  厂区数量:', res.data.data?.length || 0)
    }))

    results.push(await test('获取设备日志', async () => {
      const res = await api.get('/api/logs/device', {
        params: { page: 1, pageSize: 10 }
      })
      if (res.data.code !== 200) throw new Error(res.data.message)
      console.log('  日志数量:', res.data.data.list?.length || 0)
    }))

    results.push(await test('获取离线记录', async () => {
      const res = await api.get('/api/logs/offline', {
        params: { page: 1, pageSize: 10 }
      })
      if (res.data.code !== 200) throw new Error(res.data.message)
      console.log('  记录数量:', res.data.data.list?.length || 0)
    }))

    results.push(await test('获取审计日志', async () => {
      const res = await api.get('/api/logs/audit', {
        params: { page: 1, pageSize: 10 }
      })
      if (res.data.code !== 200) throw new Error(res.data.message)
      console.log('  日志数量:', res.data.data.list?.length || 0)
    }))
  }

  const passed = results.filter(r => r).length
  const total = results.length

  console.log('\n========================================')
  console.log(`测试结果: ${passed}/${total} 通过`)
  console.log(`成功率: ${((passed / total) * 100).toFixed(1)}%`)
  console.log('========================================')

  process.exit(passed === total ? 0 : 1)
}

runTests().catch(console.error)
