const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DEFAULT_BCRYPT_ROUNDS = 12;

function resolveRounds() {
  const envRounds = parseInt(process.env.ADMIN_PASSWORD_ROUNDS, 10);
  if (Number.isFinite(envRounds) && envRounds >= 8 && envRounds <= 15) {
    return envRounds;
  }
  return DEFAULT_BCRYPT_ROUNDS;
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(password, resolveRounds());
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

function generateSessionToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken
};
