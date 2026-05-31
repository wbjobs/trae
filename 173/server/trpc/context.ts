import { inferAsyncReturnType } from '@trpc/server'
import { H3Event } from 'h3'

export const createContext = (event: H3Event) => {
  const config = useRuntimeConfig()
  return {
    event,
    config,
    user: {
      id: 'agent-1',
      name: '客服小王',
      role: 'agent'
    }
  }
}

export type Context = inferAsyncReturnType<typeof createContext>
