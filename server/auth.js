// Нууц үг (scrypt) болон token (HMAC-SHA256) — гадны сангүй.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), '.secret');
let SECRET;
try { SECRET = fs.readFileSync(SECRET_FILE, 'utf8'); } catch (_) {
  SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, SECRET);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}

const b64 = (s) => Buffer.from(s).toString('base64url');

function signToken(payload, ttlSeconds) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Date.now() / 1000) return null;
  return payload;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
