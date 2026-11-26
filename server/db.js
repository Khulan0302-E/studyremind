// Өгөгдлийн сан: Node-ийн суурилагдсан SQLite (node:sqlite).
// Хэрэв Node хуучин бол JSON файл руу автоматаар шилжинэ.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const TABLES = ['users', 'tasks', 'sources', 'settings', 'notifications', 'classes'];

let backend;
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(DATA_DIR, 'studyremind.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  for (const t of TABLES) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${t} (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_${t}_user ON ${t}(user_id);`);
  }
  backend = {
    kind: 'sqlite',
    all(table, userId) {
      const rows = userId === undefined
        ? db.prepare(`SELECT data FROM ${table}`).all()
        : db.prepare(`SELECT data FROM ${table} WHERE user_id = ?`).all(userId);
      return rows.map((r) => JSON.parse(r.data));
    },
    get(table, id) {
      const r = db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id);
      return r ? JSON.parse(r.data) : null;
    },
    put(table, doc) {
      db.prepare(`INSERT INTO ${table} (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, data = excluded.data, updated_at = excluded.updated_at`)
        .run(doc.id, doc.userId || null, JSON.stringify(doc), new Date().toISOString());
      return doc;
    },
    remove(table, id) {
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    },
  };
} catch (e) {
  const file = path.join(DATA_DIR, 'studyremind.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* шинэ файл */ }
  for (const t of TABLES) state[t] = state[t] || {};
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => fs.writeFileSync(file, JSON.stringify(state)), 50);
  };
  backend = {
    kind: 'json',
    all(table, userId) {
      const list = Object.values(state[table]);
      return userId === undefined ? list : list.filter((d) => d.userId === userId);
    },
    get(table, id) { return state[table][id] || null; },
    put(table, doc) { state[table][doc.id] = doc; save(); return doc; },
    remove(table, id) { delete state[table][id]; save(); },
  };
}

const newId = () => crypto.randomUUID();

module.exports = { ...backend, newId };
