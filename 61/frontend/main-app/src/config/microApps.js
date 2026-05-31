const microApps = [
  {
    name: 'dashboard',
    entry: '//localhost:8001',
    container: '#micro-app-container',
    activeRule: '/dashboard',
    props: {
      routerBase: '/dashboard'
    }
  },
  {
    name: 'logtrace',
    entry: '//localhost:8002',
    container: '#micro-app-container',
    activeRule: '/logtrace',
    props: {
      routerBase: '/logtrace'
    }
  },
  {
    name: 'auth',
    entry: '//localhost:8003',
    container: '#micro-app-container',
    activeRule: '/auth',
    props: {
      routerBase: '/auth'
    }
  }
]

export default {
  apps: microApps
}
