import { z } from 'zod'
import { router, publicProcedure } from '../trpc/trpc'
import { sql, sqlOne } from '../database/client'
import { notifyTicketUpdate, notifyTicketListUpdate } from '../utils/pusher'
import { calculateSlaDeadline, SLA_RESPONSE_MINUTES, SLA_RESOLVE_MINUTES } from '../utils/sla'
import { getRecommendation as getAgentRecommendation } from '../utils/recommendation'

const TicketStatus = z.enum(['pending', 'processing', 'reviewing', 'completed'])
const TicketPriority = z.enum(['low', 'normal', 'high', 'urgent'])

export const ticketRouter = router({
  list: publicProcedure
    .input(z.object({
      status: z.string().optional(),
      assigneeId: z.string().optional(),
      customerId: z.string().optional()
    }).optional())
    .query(async ({ input }) => {
      let query = `
        SELECT t.*,
               c.name as customer_name,
               a.name as assignee_name
        FROM tickets t
        LEFT JOIN users c ON t.customer_id = c.id
        LEFT JOIN users a ON t.assignee_id = a.id
        WHERE 1=1
      `
      const params: any[] = []

      if (input?.status && input.status !== 'all') {
        params.push(input.status)
        query += ` AND t.status = $${params.length}`
      }
      if (input?.assigneeId) {
        params.push(input.assigneeId)
        query += ` AND t.assignee_id = $${params.length}`
      }
      if (input?.customerId) {
        params.push(input.customerId)
        query += ` AND t.customer_id = $${params.length}`
      }

      query += ' ORDER BY t.created_at DESC'

      const tickets = await sql(query, params)
      return tickets
    }),

  getById: publicProcedure
    .input(z.string())
    .query(async ({ input }) => {
      const ticket = await sqlOne(`
        SELECT t.*,
               c.name as customer_name,
               c.email as customer_email,
               a.name as assignee_name,
               a.email as assignee_email
        FROM tickets t
        LEFT JOIN users c ON t.customer_id = c.id
        LEFT JOIN users a ON t.assignee_id = a.id
        WHERE t.id = $1
      `, [input])

      if (!ticket) {
        throw new Error('工单不存在')
      }

      const notes = await sql(`
        SELECT tn.*, u.name as author_name
        FROM ticket_notes tn
        LEFT JOIN users u ON tn.author_id = u.id
        WHERE tn.ticket_id = $1
        ORDER BY tn.created_at DESC
      `, [input])

      const activities = await sql(`
        SELECT ta.*, u.name as user_name
        FROM ticket_activities ta
        LEFT JOIN users u ON ta.user_id = u.id
        WHERE ta.ticket_id = $1
        ORDER BY ta.created_at DESC
      `, [input])

      return { ...ticket, notes, activities }
    }),

  create: publicProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      priority: TicketPriority.default('normal'),
      customerId: z.string().uuid()
    }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date()
      const slaResponseAt = calculateSlaDeadline(now, SLA_RESPONSE_MINUTES)
      const slaResolveAt = calculateSlaDeadline(now, SLA_RESOLVE_MINUTES)

      const result = await sqlOne(`
        INSERT INTO tickets (title, description, priority, customer_id, sla_response_at, sla_resolve_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [input.title, input.description, input.priority, input.customerId, slaResponseAt, slaResolveAt])

      await sql(`
        INSERT INTO ticket_activities (ticket_id, user_id, action, note)
        VALUES ($1, $2, 'created', '工单已创建')
      `, [result.id, input.customerId])

      await notifyTicketListUpdate({ type: 'created', ticket: result })
      return result
    }),

  assign: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      assigneeId: z.string().uuid()
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = await sqlOne('SELECT * FROM tickets WHERE id = $1', [input.ticketId])
      if (!ticket) {
        throw new Error('工单不存在')
      }

      const result = await sqlOne(`
        UPDATE tickets
        SET assignee_id = $1,
            status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END,
            responded_at = CASE WHEN responded_at IS NULL AND status = 'pending' THEN NOW() ELSE responded_at END
        WHERE id = $2
        RETURNING *
      `, [input.assigneeId, input.ticketId])

      await sql(`
        INSERT INTO ticket_activities (ticket_id, user_id, action, note)
        VALUES ($1, $2, 'assigned', '工单已指派')
      `, [input.ticketId, ctx.user.id])

      await notifyTicketUpdate(input.ticketId, { type: 'assigned', ticket: result })
      await notifyTicketListUpdate({ type: 'updated', ticket: result })
      return result
    }),

  transfer: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      newAssigneeId: z.string().uuid(),
      reason: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = await sqlOne('SELECT * FROM tickets WHERE id = $1', [input.ticketId])
      if (!ticket) {
        throw new Error('工单不存在')
      }

      const result = await sqlOne(`
        UPDATE tickets
        SET assignee_id = $1
        WHERE id = $2
        RETURNING *
      `, [input.newAssigneeId, input.ticketId])

      await sql(`
        INSERT INTO ticket_activities (ticket_id, user_id, action, note)
        VALUES ($1, $2, 'transferred', $3)
      `, [input.ticketId, ctx.user.id, input.reason || '工单已转派'])

      await notifyTicketUpdate(input.ticketId, { type: 'transferred', ticket: result })
      await notifyTicketListUpdate({ type: 'updated', ticket: result })
      return result
    }),

  updateStatus: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      status: TicketStatus
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = await sqlOne('SELECT * FROM tickets WHERE id = $1', [input.ticketId])
      if (!ticket) {
        throw new Error('工单不存在')
      }

      const result = await sqlOne(`
        UPDATE tickets
        SET status = $1,
            resolved_at = CASE WHEN $1 = 'completed' AND resolved_at IS NULL THEN NOW() ELSE resolved_at END,
            responded_at = CASE WHEN $1 != 'pending' AND responded_at IS NULL THEN NOW() ELSE responded_at END
        WHERE id = $2
        RETURNING *
      `, [input.status, input.ticketId])

      await sql(`
        INSERT INTO ticket_activities (ticket_id, user_id, action, old_status, new_status)
        VALUES ($1, $2, 'status_changed', $3, $4)
      `, [input.ticketId, ctx.user.id, ticket.status, input.status])

      await notifyTicketUpdate(input.ticketId, { type: 'status_changed', ticket: result })
      await notifyTicketListUpdate({ type: 'updated', ticket: result })
      return result
    }),

  addNote: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      content: z.string().min(1)
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = await sqlOne('SELECT * FROM tickets WHERE id = $1', [input.ticketId])
      if (!ticket) {
        throw new Error('工单不存在')
      }

      const result = await sqlOne(`
        INSERT INTO ticket_notes (ticket_id, author_id, content)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [input.ticketId, ctx.user.id, input.content])

      await sql(`
        INSERT INTO ticket_activities (ticket_id, user_id, action, note)
        VALUES ($1, $2, 'note_added', '添加了内部备注')
      `, [input.ticketId, ctx.user.id])

      const note = await sqlOne(`
        SELECT tn.*, u.name as author_name
        FROM ticket_notes tn
        LEFT JOIN users u ON tn.author_id = u.id
        WHERE tn.id = $1
      `, [result.id])

      await notifyTicketUpdate(input.ticketId, { type: 'note_added', note })
      return note
    }),

  getAgents: publicProcedure
    .query(async () => {
      const agents = await sql(`
        SELECT id, name, email, role
        FROM users
        WHERE role IN ('admin', 'agent')
        ORDER BY name
      `)
      return agents
    }),

  getStats: publicProcedure
    .query(async () => {
      const stats = await sqlOne(`
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'pending') as pending,
            COUNT(*) FILTER (WHERE status = 'processing') as processing,
            COUNT(*) FILTER (WHERE status = 'reviewing') as reviewing,
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) FILTER (WHERE status != 'completed' AND sla_response_at < NOW() AND responded_at IS NULL) as breached_response,
            COUNT(*) FILTER (WHERE status != 'completed' AND sla_resolve_at < NOW()) as breached_resolve
        FROM tickets
      `)
      return stats
    }),

  getRecommendation: publicProcedure
    .query(async () => {
      return getAgentRecommendation()
    }),

  autoAssign: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid()
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = await sqlOne('SELECT * FROM tickets WHERE id = $1', [input.ticketId])
      if (!ticket) {
        throw new Error('工单不存在')
      }

      const { recommended } = await getAgentRecommendation()
      if (!recommended) {
        throw new Error('暂无可用客服')
      }

      const result = await sqlOne(`
        UPDATE tickets
        SET assignee_id = $1,
            status = CASE WHEN status = 'pending' THEN 'processing' ELSE status END,
            responded_at = CASE WHEN responded_at IS NULL AND status = 'pending' THEN NOW() ELSE responded_at END
        WHERE id = $2
        RETURNING *
      `, [recommended.id, input.ticketId])

      await sql(`
        INSERT INTO ticket_activities (ticket_id, user_id, action, note)
        VALUES ($1, $2, 'assigned', '智能分派: ' || $3)
      `, [input.ticketId, ctx.user.id, recommended.name])

      await notifyTicketUpdate(input.ticketId, { type: 'assigned', ticket: result })
      await notifyTicketListUpdate({ type: 'updated', ticket: result })
      return result
    })
})
