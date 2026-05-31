import { eventHandler, setHeader, sendStream } from 'h3'
import { sql } from '../database/client'

export default eventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'Access-Control-Allow-Origin', '*')

  const ticketId = getQuery(event).ticketId as string

  const sendEvent = (type: string, data: any) => {
    return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  }

  const stream = new ReadableStream({
    start(controller) {
      if (ticketId) {
        controller.enqueue(sendEvent('connected', { message: `Connected to ticket ${ticketId}` }))
      } else {
        controller.enqueue(sendEvent('connected', { message: 'Connected to ticket system' }))
      }

      const interval = setInterval(async () => {
        try {
          if (ticketId) {
            const tickets = await sql(`
              SELECT t.*, c.name as customer_name, a.name as assignee_name
              FROM tickets t
              LEFT JOIN users c ON t.customer_id = c.id
              LEFT JOIN users a ON t.assignee_id = a.id
              WHERE t.id = $1
            `, [ticketId])
            controller.enqueue(sendEvent('ticket-update', tickets[0]))
          } else {
            const tickets = await sql(`
              SELECT t.*, c.name as customer_name, a.name as assignee_name
              FROM tickets t
              LEFT JOIN users c ON t.customer_id = c.id
              LEFT JOIN users a ON t.assignee_id = a.id
              ORDER BY t.updated_at DESC
              LIMIT 50
            `)
            controller.enqueue(sendEvent('list-update', tickets))
          }
        } catch (e) {
          console.error('SSE Error:', e)
        }
      }, 3000)

      event.node.req.on('close', () => {
        clearInterval(interval)
        controller.close()
      })
    },

    cancel() {
      console.log('SSE Connection closed')
    }
  })

  return sendStream(event, stream)
})
