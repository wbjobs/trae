import Router from 'koa-router'
import { Factory } from '../models/Factory.js'

const router = new Router()

router.get('/', async (ctx) => {
  const factories = await Factory.findAll({
    where: { status: 1 },
    order: [['createdAt', 'DESC']]
  })

  ctx.body = {
    code: 200,
    message: 'success',
    data: factories.map(f => f.toJSON())
  }
})

router.post('/', async (ctx) => {
  const factoryData = ctx.request.body

  const factory = await Factory.create(factoryData)

  ctx.body = {
    code: 200,
    message: '创建成功',
    data: factory.toJSON()
  }
})

router.put('/:id', async (ctx) => {
  const { id } = ctx.params
  const updates = ctx.request.body

  await Factory.update(updates, { where: { id } })

  ctx.body = {
    code: 200,
    message: '更新成功',
    data: null
  }
})

router.delete('/:id', async (ctx) => {
  const { id } = ctx.params

  await Factory.update({ status: 0 }, { where: { id } })

  ctx.body = {
    code: 200,
    message: '删除成功',
    data: null
  }
})

export default router
