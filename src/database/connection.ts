import sql from 'mssql';
import { config } from '../config/index.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('database');

let pool: sql.ConnectionPool | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(
    config.DATABASE_SERVER &&
      config.DATABASE_NAME &&
      config.DATABASE_USER &&
      config.DATABASE_PASSWORD
  );
}

export function getSqlConfig(): sql.config {
  if (!isDatabaseConfigured()) {
    throw new Error(
      'Database is not configured. Set DATABASE_SERVER, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD in .env'
    );
  }

  return {
    server: config.DATABASE_SERVER,
    database: config.DATABASE_NAME,
    user: config.DATABASE_USER,
    password: config.DATABASE_PASSWORD,
    options: {
      encrypt: config.DATABASE_ENCRYPT,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  };
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) {
    return pool;
  }

  const sqlConfig = getSqlConfig();
  log.info('Connecting to SQL Server', {
    server: sqlConfig.server,
    database: sqlConfig.database,
  });

  pool = await new sql.ConnectionPool(sqlConfig).connect();
  log.info('SQL Server connected');
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    log.info('SQL Server pool closed');
  }
}

export { sql };
