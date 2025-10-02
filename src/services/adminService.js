const prisma = require('../config/prisma');
const Logger = require('../utils/logger');
const config = require('../config');
const { hashPassword, verifyPassword } = require('../utils/security');

const logger = new Logger(config.logging.level);

function sanitizeAdmin(admin) {
  if (!admin) return null;
  const { passwordHash, ...rest } = admin;
  return rest;
}

async function listAdmins() {
  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' }
  });

  const defaultUsername = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();

  const filtered = admins.filter((admin) => {
    if (!defaultUsername) return true;
    return admin.username.toLowerCase() !== defaultUsername || !admin.isPermanent;
  });

  return filtered.map(sanitizeAdmin);
}

async function getAdminById(id) {
  const admin = await prisma.adminUser.findUnique({ where: { id } });
  return admin;
}

async function getAdminByUsername(username) {
  const admin = await prisma.adminUser.findUnique({ where: { username } });
  return admin;
}

async function createAdmin({ username, password, status = 'ACTIVE', isPermanent = false, expiresAt = null, notes = null, createdById = null }) {
  if (!username || !password) {
    throw new Error('username and password are required');
  }

  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) {
    throw new Error('Username already exists');
  }

  const passwordHash = await hashPassword(password);

  const newAdmin = await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      status,
      isPermanent,
      expiresAt,
      notes,
      createdById
    }
  });

  logger.info('Admin user created', { username, createdById });
  return sanitizeAdmin(newAdmin);
}

async function updateAdmin(id, updates = {}) {
  const data = { ...updates };

  if (data.password) {
    data.passwordHash = await hashPassword(data.password);
    delete data.password;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'status') && !data.status) {
    delete data.status;
  }

  const updated = await prisma.adminUser.update({
    where: { id },
    data
  });

  logger.info('Admin user updated', { id });
  return sanitizeAdmin(updated);
}

async function disableAdmin(id, reason = null, actorId = null) {
  const updateData = {
    status: 'DISABLED',
    updatedAt: new Date()
  };

  if (typeof reason === 'string' && reason.trim().length > 0) {
    updateData.notes = reason.trim();
  }

  const updated = await prisma.adminUser.update({
    where: { id },
    data: updateData
  });

  logger.warn('Admin user disabled', { id, actorId, reason });
  return sanitizeAdmin(updated);
}

async function deleteAdmin(id) {
  await prisma.$transaction(async (tx) => {
    await tx.adminSession.deleteMany({ where: { adminUserId: id } });
    await tx.accessKey.updateMany({
      where: { createdById: id },
      data: { createdById: null }
    });
    await tx.adminUser.delete({ where: { id } });
  });

  logger.warn('Admin user deleted', { id });
}

async function validateCredentials(username, password) {
  const admin = await getAdminByUsername(username);
  if (!admin) return null;

  if (admin.status !== 'ACTIVE') {
    return null;
  }

  if (admin.expiresAt && admin.expiresAt < new Date()) {
    return null;
  }

  const isValid = await verifyPassword(password, admin.passwordHash);
  if (!isValid) {
    return null;
  }

  return admin;
}

async function recordLogin(adminId) {
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { lastLoginAt: new Date() }
  });
}

async function ensureDefaultAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return null;
  }

  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) {
    return sanitizeAdmin(existing);
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      status: 'ACTIVE',
      isPermanent: true,
      notes: 'Auto-created from ADMIN_USERNAME/ADMIN_PASSWORD'
    }
  });

  logger.info('Default admin provisioned from env');
  return sanitizeAdmin(admin);
}

module.exports = {
  listAdmins,
  getAdminById,
  getAdminByUsername,
  createAdmin,
  updateAdmin,
  disableAdmin,
  deleteAdmin,
  validateCredentials,
  recordLogin,
  ensureDefaultAdmin,
  sanitizeAdmin
};
