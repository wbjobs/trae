import http from 'http'
import net from 'net'

const services = [
  { name: '后端 HTTP 服务', host: 'localhost', port: 3000, path: '/api/health' },
  { name: 'TCP 服务', host: 'localhost', port: 8888, type: 'tcp' },
  { name: 'WebSocket 服务', host: 'localhost', port: 3001, type: 'tcp' }
]

const checkHttp = (service) => {
  return new Promise((resolve) => {
    const options = {
      hostname: service.host,
      port: service.port,
      path: service.path,
      method: 'GET',
      timeout: 5000
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({
            name: service.name,
            status: json.code === 200 ? '健康' : '异常',
            info: json.data?.status || '未知'
          })
        } catch {
          resolve({
            name: service.name,
            status: '异常',
            info: '响应格式错误'
          })
        }
      })
    })

    req.on('error', (err) => {
      resolve({
        name: service.name,
        status: '不可用',
        info: err.message
      })
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({
        name: service.name,
        status: '超时',
        info: '连接超时'
      })
    })

    req.end()
  })
}

const checkTcp = (service) => {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(3000)

    socket.connect(service.port, service.host, () => {
      socket.destroy()
      resolve({
        name: service.name,
        status: '健康',
        info: '端口可访问'
      })
    })

    socket.on('error', (err) => {
      resolve({
        name: service.name,
        status: '不可用',
        info: err.message
      })
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve({
        name: service.name,
        status: '超时',
        info: '连接超时'
      })
    })
  })
}

const checkAll = async () => {
  console.log('========================================')
  console.log('工业物联网平台 - 服务健康检查')
  console.log('========================================\n')

  const results = await Promise.all(
    services.map(service => 
      service.type === 'tcp' ? checkTcp(service) : checkHttp(service)
    )
  )

  results.forEach(result => {
    const statusColor = result.status === '健康' ? '\x1b[32m' : '\x1b[31m'
    console.log(`${result.name}: ${statusColor}${result.status}\x1b[0m`)
    console.log(`  信息: ${result.info}\n`)
  })

  const allHealthy = results.every(r => r.status === '健康')
  console.log('========================================')
  console.log(`整体状态: ${allHealthy ? '\x1b[32m全部正常\x1b[0m' : '\x1b[31m存在异常\x1b[0m'}`)
  console.log('========================================')

  process.exit(allHealthy ? 0 : 1)
}

checkAll()
