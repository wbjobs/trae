import { usePusher } from '../utils/pusher'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { socket_id, channel_name } = body

  const pusher = usePusher()

  const auth = pusher.authenticate(socket_id, channel_name)

  return auth
})
