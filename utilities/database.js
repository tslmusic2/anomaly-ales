import pg from 'pg'

const { Pool } = pg

const connectionString = process.env.DATABASE_URL_POOLED

if (!connectionString) {
    throw new Error('DATABASE_URL_POOLED is missing')
}

export const pool = new Pool({
    connectionString
})