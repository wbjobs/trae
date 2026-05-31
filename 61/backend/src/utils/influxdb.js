import { InfluxDB, Point } from '@influxdata/influxdb-client'
import logger from './logger.js'

let influxDB = null
let writeApi = null
let queryApi = null

export const init = () => {
  const host = process.env.INFLUXDB_HOST || 'localhost'
  const port = process.env.INFLUXDB_PORT || 8086
  const token = process.env.INFLUXDB_TOKEN || 'iot-token'
  const org = process.env.INFLUXDB_ORG || 'iot-org'
  const bucket = process.env.INFLUXDB_BUCKET || 'iot-data'

  influxDB = new InfluxDB({
    url: `http://${host}:${port}`,
    token
  })

  writeApi = influxDB.getWriteApi(org, bucket)
  writeApi.useDefaultTags({ source: 'iot-gateway' })

  queryApi = influxDB.getQueryApi(org)

  logger.info('InfluxDB 初始化完成')
}

export const writeMetrics = async (deviceId, metrics) => {
  if (!writeApi) {
    throw new Error('InfluxDB 未初始化')
  }

  const point = new Point('device_metrics')
    .tag('deviceId', deviceId)

  if (metrics.temperature !== undefined) {
    point.floatField('temperature', metrics.temperature)
  }
  if (metrics.pressure !== undefined) {
    point.floatField('pressure', metrics.pressure)
  }
  if (metrics.flow !== undefined) {
    point.floatField('flow', metrics.flow)
  }
  if (metrics.humidity !== undefined) {
    point.floatField('humidity', metrics.humidity)
  }
  if (metrics.vibration !== undefined) {
    point.floatField('vibration', metrics.vibration)
  }
  if (metrics.current !== undefined) {
    point.floatField('current', metrics.current)
  }
  if (metrics.voltage !== undefined) {
    point.floatField('voltage', metrics.voltage)
  }
  if (metrics.power !== undefined) {
    point.floatField('power', metrics.power)
  }

  if (metrics.factory) {
    point.tag('factory', metrics.factory)
  }
  if (metrics.type) {
    point.tag('type', metrics.type)
  }

  if (metrics.timestamp) {
    point.timestamp(new Date(metrics.timestamp))
  }

  writeApi.writePoint(point)
  await writeApi.flush()
}

export const writeBatchMetrics = async (metricsList) => {
  if (!writeApi) {
    throw new Error('InfluxDB 未初始化')
  }

  for (const metrics of metricsList) {
    const point = new Point('device_metrics')
      .tag('deviceId', metrics.deviceId)

    if (metrics.temperature !== undefined) {
      point.floatField('temperature', metrics.temperature)
    }
    if (metrics.pressure !== undefined) {
      point.floatField('pressure', metrics.pressure)
    }
    if (metrics.flow !== undefined) {
      point.floatField('flow', metrics.flow)
    }
    if (metrics.humidity !== undefined) {
      point.floatField('humidity', metrics.humidity)
    }
    if (metrics.vibration !== undefined) {
      point.floatField('vibration', metrics.vibration)
    }
    if (metrics.current !== undefined) {
      point.floatField('current', metrics.current)
    }
    if (metrics.voltage !== undefined) {
      point.floatField('voltage', metrics.voltage)
    }
    if (metrics.power !== undefined) {
      point.floatField('power', metrics.power)
    }
    if (metrics.rpm !== undefined) {
      point.floatField('rpm', metrics.rpm)
    }
    if (metrics.load !== undefined) {
      point.floatField('load', metrics.load)
    }
    if (metrics.factory) {
      point.tag('factory', metrics.factory)
    }
    if (metrics.type) {
      point.tag('type', metrics.type)
    }
    if (metrics.timestamp) {
      point.timestamp(new Date(metrics.timestamp))
    }

    writeApi.writePoint(point)
  }

  await writeApi.flush()
}

export const queryMetrics = async (deviceId, startTime, endTime, fields = ['temperature', 'pressure']) => {
  if (!queryApi) {
    throw new Error('InfluxDB 未初始化')
  }

  const validFields = ['temperature', 'pressure', 'flow', 'humidity', 'vibration', 'current', 'voltage', 'power', 'rpm', 'load']
  let safeFields = fields.filter(f => validFields.includes(f))
  if (safeFields.length === 0) {
    safeFields = ['temperature', 'pressure']
  }

  const fluxQuery = `
    from(bucket: "${process.env.INFLUXDB_BUCKET || 'iot-data'}")
      |> range(start: ${startTime}, stop: ${endTime})
      |> filter(fn: (r) => r._measurement == "device_metrics" and r.deviceId == "${deviceId}")
      |> filter(fn: (r) => ${safeFields.map(f => `r._field == "${f}"`).join(' or ')})
      |> sort(columns: ["_time"])
  `

  try {
    const result = await queryApi.collectRows(fluxQuery)
    return result
  } catch (error) {
    logger.error('查询时序数据失败:', error)
    return []
  }
}

export const getWriteApi = () => writeApi
export const getQueryApi = () => queryApi

export default {
  init,
  writeMetrics,
  writeBatchMetrics,
  queryMetrics,
  getWriteApi,
  getQueryApi
}
