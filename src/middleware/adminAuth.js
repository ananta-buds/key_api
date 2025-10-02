const Logger = require('../utils/logger');
const config = require('../config');
const prisma = require('../config/prisma');
const adminService = require('../services/adminService');
const { getClientIp } = require('../utils/keyUtils');
const { generateSessionToken, hashSessionToken } = require('../utils/security');

const logger = new Logger(config.logging.level);

class AdminAuth {
  constructor() {
    this.loginAttempts = new Map();
    this.maxAttempts = parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || '10', 10);
    this.windowMs = parseInt(process.env.ADMIN_LOGIN_WINDOW_MS || String(15 * 60 * 1000), 10);
    const ttlHours = parseInt(process.env.ADMIN_SESSION_TTL_HOURS || '24', 10);
    const safeHours = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24;
    this.sessionTtlMs = safeHours * 60 * 60 * 1000;
    this.defaultAdminEnsured = false;
  }

  async ensureDefaultAdmin() {
    if (this.defaultAdminEnsured) return;
    try {
      await adminService.ensureDefaultAdmin();
    } catch (error) {
      logger.error('Failed to provision default admin', error);
    }
    this.defaultAdminEnsured = true;
  }

  trackAttempt(ip) {
    if (!ip) return { blocked: false };
    const now = Date.now();
    const record = this.loginAttempts.get(ip) || { count: 0, firstAt: now };

    if (now - record.firstAt > this.windowMs) {
      record.count = 0;
      record.firstAt = now;
    }

    if (record.count >= this.maxAttempts) {
      this.loginAttempts.set(ip, record);
      return { blocked: true };
    }

    record.count += 1;
    this.loginAttempts.set(ip, record);
    return { blocked: false };
  }

  resetAttempts(ip) {
    if (ip) {
      this.loginAttempts.delete(ip);
    }
  }

  async authenticate(req, res, next) {
    try {
      await this.ensureDefaultAdmin();

      const clientIp = getClientIp(req) || req.ip || 'unknown';
      const rate = this.trackAttempt(clientIp);
      if (rate.blocked) {
        logger.warn(`Admin login rate limited for ${clientIp}`);
        return res.status(429).json({ success: false, message: 'Too many attempts, try again later' });
      }

      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
      }

      const admin = await adminService.validateCredentials(username, password);
      if (!admin) {
        logger.warn(`Failed admin login attempt from ${clientIp}`);
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      this.resetAttempts(clientIp);

      const sessionToken = generateSessionToken();
      const hashedTokenHex = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + this.sessionTtlMs);

      const sessionRecord = await prisma.adminSession.create({
        data: {
          adminUserId: admin.id,
          sessionTokenHash: Buffer.from(hashedTokenHex, 'hex'),
          ipAddress: clientIp,
          userAgent: req.get('User-Agent') || null,
          expiresAt
        }
      });

      await adminService.recordLogin(admin.id);

      res.cookie('admin_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: this.sessionTtlMs
      });

      logger.info(`Admin login successful from ${clientIp}`);

      return res.json({
        success: true,
        message: 'Authentication successful',
        sessionToken,
        admin: adminService.sanitizeAdmin(admin),
        session: {
          id: sessionRecord.id,
          expiresAt: sessionRecord.expiresAt
        }
      });
    } catch (error) {
      logger.error('Admin authentication failed', error);
      return next(error);
    }
  }

  async requireAuth(req, res, next) {
    try {
      const sessionToken = req.cookies?.admin_session || req.headers['x-admin-session'];

      if (!sessionToken) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const hashedToken = hashSessionToken(sessionToken);
      const session = await prisma.adminSession.findUnique({
        where: { sessionTokenHash: Buffer.from(hashedToken, 'hex') },
        include: { admin: true }
      });

      if (!session) {
        return res.status(401).json({ success: false, message: 'Invalid or expired session' });
      }

      if (session.revokedAt || session.expiresAt <= new Date()) {
        await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {});
        return res.status(401).json({ success: false, message: 'Session expired' });
      }

      await prisma.adminSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() }
      }).catch(() => {});

      req.adminSession = {
        id: session.id,
        adminUserId: session.adminUserId,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        ip: session.ipAddress,
        userAgent: session.userAgent
      };
      req.adminUser = adminService.sanitizeAdmin(session.admin);

      return next();
    } catch (error) {
      return next(error);
    }
  }

  async logout(req, res) {
    const sessionToken = req.cookies?.admin_session || req.headers['x-admin-session'];
    if (sessionToken) {
      const hashedToken = hashSessionToken(sessionToken);
      await prisma.adminSession.deleteMany({
        where: { sessionTokenHash: Buffer.from(hashedToken, 'hex') }
      }).catch(() => {});
      res.clearCookie('admin_session');
    }

    res.json({ success: true, message: 'Logged out successfully' });
  }

  getSessionInfo(req, res) {
    res.json({
      success: true,
      session: req.adminSession,
      admin: req.adminUser
    });
  }

  async getActiveSessions(req, res, next) {
    try {
      const sessions = await prisma.adminSession.findMany({
        orderBy: { createdAt: 'desc' },
        include: { admin: true }
      });

      const sanitized = sessions.map((session) => ({
        id: session.id,
        username: session.admin?.username || null,
        admin: session.admin
          ? {
              id: session.admin.id,
              username: session.admin.username,
              status: session.admin.status
            }
          : null,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        ip: session.ipAddress,
        userAgent: session.userAgent
      }));

      res.json({ success: true, sessions: sanitized, count: sanitized.length });
    } catch (error) {
      next(error);
    }
  }

  async clearAllSessions(req, res, next) {
    try {
      const result = await prisma.adminSession.deleteMany();
      res.clearCookie('admin_session');
      logger.info(`Cleared ${result.count} admin sessions`);
      res.json({ success: true, message: `Cleared ${result.count} sessions` });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminAuth();
