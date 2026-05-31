import { Pool } from 'pg'

let pool: Pool | null = null

export const useDatabase = () => {
  if (!pool) {
    const config = useRuntimeConfig()
    pool = new Pool({
      connectionString: config.databaseUrl
    })
  }
  return pool
}

export const sql = async (query: string, params?: any[]) => {
  const db = useDatabase()
  const result = await db.query(query, params)
  return result.rows
}

export const sqlOne = async (query: string, params?: any[]) => {
  const rows = await sql(query, params)
  return rows[0] || null
}
