const { Pool } = require('pg')
const { loadConfig } = require('../config')

let pool

function getPool() {
  if (!pool) {
    const config = loadConfig()
    pool = new Pool(config.database)

    pool.on('error', (error) => {
      console.error('Koneksi PostgreSQL yang sedang idle mengalami gangguan.', {
        code: error.code || 'UNKNOWN',
      })
    })
  }

  return pool
}

async function checkConnection() {
  const result = await getPool().query(
    'SELECT current_database() AS database, current_user AS username'
  )

  return result.rows[0]
}

async function closePool() {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}

async function runConnectionCheck() {
  try {
    const result = await checkConnection()
    console.log('Koneksi PostgreSQL berhasil.')
    console.log(`Database: ${result.database}`)
    console.log(`User: ${result.username}`)
  } finally {
    await closePool()
  }
}

if (require.main === module) {
  runConnectionCheck().catch((error) => {
    console.error('Uji koneksi gagal:', error.message)
    process.exitCode = 1
  })
}

module.exports = { getPool, checkConnection, closePool }
