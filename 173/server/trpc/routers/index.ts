import { router } from '../trpc/trpc'
import { ticketRouter } from './routers/ticket'

export const appRouter = router({
  ticket: ticketRouter
})

export type AppRouter = typeof appRouter
