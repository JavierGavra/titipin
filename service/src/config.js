function readRequired(name) {
  const value = process.env[name]

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Konfigurasi ${name} wajib diisi.`)
  }

  return value
}

function readPositiveInteger(name, maximum) {
  const raw = readRequired(name).trim()
  const value = Number(raw)

  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value)
      || value < 1 || value > maximum) {
    throw new Error(`Konfigurasi ${name} harus bilangan bulat antara 1 dan ${maximum}.`)
  }

  return value
}

function loadConfig() {
  return {
    port: readPositiveInteger('PORT', 65535),
    database: {
      host: readRequired('PGHOST').trim(),
      port: readPositiveInteger('PGPORT', 65535),
      database: readRequired('PGDATABASE').trim(),
      user: readRequired('PGUSER').trim(),
      password: readRequired('PGPASSWORD'),
      connectionTimeoutMillis: readPositiveInteger('DB_CONNECTION_TIMEOUT_MS', 2147483647),
    },
  }
}

module.exports = { loadConfig }