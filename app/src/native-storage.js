import { createState, validateState } from '../../shared/domain.js';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const DATABASE = 'the_rest_of_today';
const SCHEMA_VERSION = 1;
let sqlite;
let connection;

async function run(statement, values = []) {
  return connection.run({ statement, values });
}

async function query(statement, values = []) {
  const result = await connection.query({ statement, values });
  return result.values || [];
}

export async function initialize() {
  sqlite = new SQLiteConnection(CapacitorSQLite);
  connection = await sqlite.createConnection(DATABASE, false, 'no-encryption', SCHEMA_VERSION, false);
  await connection.open();
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sleep_records (id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, note TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS confirmations (date TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS goals (effective_date TEXT PRIMARY KEY NOT NULL, minutes INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  `);
  const rows = await query('SELECT value FROM schema_meta WHERE key = ?', ['version']);
  if (!rows.length) await run('INSERT INTO schema_meta(key, value) VALUES(?, ?)', ['version', String(SCHEMA_VERSION)]);
  else if (Number(rows[0].value) !== SCHEMA_VERSION) throw new Error('本地数据版本不受支持，请先导出备份。');
}

export async function readState() {
  const records = await query('SELECT id, type, start, end, note FROM sleep_records ORDER BY start');
  const confirmations = await query('SELECT date, status FROM confirmations');
  const goals = await query('SELECT effective_date AS effectiveDate, minutes FROM goals ORDER BY effective_date');
  const meta = await query('SELECT key, value FROM app_meta');
  const values = Object.fromEntries(meta.map(row => [row.key, row.value]));
  const initial = createState(values.createdAt ? new Date(values.createdAt) : new Date());
  const candidate = {
    ...initial,
    createdAt: values.createdAt || initial.createdAt,
    startDate: values.startDate || initial.startDate,
    lastBackupAt: values.lastBackupAt || null,
    records,
    confirmations: Object.fromEntries(confirmations.map(row => [row.date, row.status])),
    goals: goals.length ? goals : initial.goals
  };
  return validateState(candidate);
}

export async function writeState(state) {
  validateState(state);
  // Every table is replaced in one SQLite transaction so a failed write leaves the old state intact.
  await connection.execute('BEGIN TRANSACTION');
  try {
    await connection.execute('DELETE FROM sleep_records; DELETE FROM confirmations; DELETE FROM goals; DELETE FROM app_meta;');
    for (const record of state.records) await run('INSERT INTO sleep_records(id, type, start, end, note) VALUES(?, ?, ?, ?, ?)', [record.id, record.type, record.start, record.end, record.note]);
    for (const [date, status] of Object.entries(state.confirmations)) await run('INSERT INTO confirmations(date, status) VALUES(?, ?)', [date, status]);
    for (const goal of state.goals) await run('INSERT INTO goals(effective_date, minutes) VALUES(?, ?)', [goal.effectiveDate, goal.minutes]);
    for (const [key, value] of [['createdAt', state.createdAt], ['startDate', state.startDate], ['lastBackupAt', state.lastBackupAt]]) {
      if (value !== null && value !== undefined) await run('INSERT INTO app_meta(key, value) VALUES(?, ?)', [key, String(value)]);
    }
    await connection.execute('COMMIT');
  } catch (error) {
    await connection.execute('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function readSettings() {
  const rows = await query("SELECT key, value FROM app_meta WHERE key LIKE 'setting:%'");
  return Object.fromEntries(rows.map(row => [row.key.slice('setting:'.length), JSON.parse(row.value)]));
}

export async function writeSettings(settings) {
  for (const [key, value] of Object.entries(settings || {})) await run('INSERT OR REPLACE INTO app_meta(key, value) VALUES(?, ?)', [`setting:${key}`, JSON.stringify(value)]);
}

export async function wipeState() {
  const settings = await readSettings();
  await connection.execute('BEGIN TRANSACTION');
  try {
    await connection.execute('DELETE FROM sleep_records; DELETE FROM confirmations; DELETE FROM goals; DELETE FROM app_meta WHERE key NOT LIKE \'setting:%\';');
    await connection.execute('COMMIT');
  } catch (error) {
    await connection.execute('ROLLBACK').catch(() => {});
    throw error;
  }
  return { ...createState(), settings };
}

export async function rawBackup() { return JSON.stringify(await readState()); }
