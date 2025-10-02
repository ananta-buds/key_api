const Logger = require('../utils/logger');
const config = require('../config');
const { getClientIp } = require('../utils/keyUtils');
const adminService = require('../services/adminService');

const logger = new Logger(config.logging.level);

// Simple in-memory session store (for development)
// In production, use Redis or another persistent store
const sessions = new Map();

// Legacy admin credentials (configurable via environment)
// Used as fallback if no admin users exist in database
const legacyAdminUser = {
  username: process.env.ADMIN_USERNAME || 'admin',
  // Fallback to legacy ADMIN_DEFAULT_PASSWORD if ADMIN_PASSWORD is not set
  password: process.env.ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'
};

class AdminAuth {
  constructor() {
    // Simple in-memory rate limit per IP for login attempts
    this.loginAttempts = new Map(); // ip -> { count, firstAt }
    this.maxAttempts = parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || '10');
    this.windowMs = parseInt(process.env.ADMIN_LOGIN_WINDOW_MS || String(15 * 60 * 1000)); // 15 min
  }
  /**
   * Generate session token
   */
  generateSession() {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * Authenticate admin login (username + password)
   */
  async authenticate(req, res, next) {
    // Basic IP rate limit
    try {
      const ip = getClientIp(req) || req.ip || 'unknown';
      const now = Date.now();
      const rec = this.loginAttempts.get(ip) || { count: 0, firstAt: now };
      if (now - rec.firstAt > this.windowMs) {
        rec.count = 0;
        rec.firstAt = now;
      }
      if (rec.count >= this.maxAttempts) {
        logger.warn(`Admin login rate limited for ${ip}`);
        return res.status(429).json({ success: false, message: 'Too many attempts, try again later' });
      }

      this.loginAttempts.set(ip, rec);
    } catch (_) {}

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    try {
      // Try to validate against database first
      const validation = await adminService.validateCredentials(username, password);

      let isValid = false;
      let adminData = null;

      if (validation.valid) {
        isValid = true;
        adminData = validation.admin;
      } else {
        // Fallback to legacy credentials (always available as master password)
        if (username === legacyAdminUser.username && password === legacyAdminUser.password) {
          isValid = true;
          adminData = { username: legacyAdminUser.username, id: null };
          logger.info('Using legacy admin credentials (master password)');
        }
      }

      if (!isValid) {
        // increment attempts on invalid login
        try {
          const ip = getClientIp(req) || req.ip || 'unknown';
          const rec = this.loginAttempts.get(ip);
          if (rec) {
            rec.count += 1;
            this.loginAttempts.set(ip, rec);
          }
        } catch (_) {}
        logger.warn(`Failed admin login attempt from ${getClientIp(req)} for user: ${username}`);
        return res.status(401).json({
          success: false,
          message: validation.error || 'Invalid credentials'
        });
      }

      // Create session
      const sessionToken = this.generateSession();
      const sessionData = {
        id: sessionToken,
        username: adminData.username,
        adminId: adminData.id,
        createdAt: new Date(),
        ip: getClientIp(req),
        userAgent: req.get('User-Agent')
      };

      sessions.set(sessionToken, sessionData);

      // reset attempts on success
      try {
        const ip = sessionData.ip || 'unknown';
        this.loginAttempts.delete(ip);
      } catch (_) {}

      // Set session cookie
      res.cookie('admin_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
      });

      logger.info(`Admin login successful from ${sessionData.ip} for user: ${adminData.username}`);

      return res.json({
        success: true,
        message: 'Authentication successful',
        sessionToken,
        username: adminData.username
      });
    } catch (error) {
      logger.error('Authentication error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error during authentication'
      });
    }
  }

  /**
   * Middleware to check if user is authenticated
   */
  requireAuth(req, res, next) {
    const sessionToken = req.cookies?.admin_session || req.headers['x-admin-session'];

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const session = sessions.get(sessionToken);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    // Check session age (24 hours)
    const sessionAge = Date.now() - session.createdAt.getTime();
    if (sessionAge > 24 * 60 * 60 * 1000) {
      sessions.delete(sessionToken);
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    req.adminSession = session;
    next();
  }

  /**
   * Logout and destroy session
   */
  logout(req, res) {
    const sessionToken = req.cookies?.admin_session;

    if (sessionToken) {
      sessions.delete(sessionToken);
      res.clearCookie('admin_session');
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }

  /**
   * Get session info
   */
  getSessionInfo(req, res) {
    res.json({
      success: true,
      session: {
        id: req.adminSession.id,
        createdAt: req.adminSession.createdAt,
        ip: req.adminSession.ip
      }
    });
  }

  /**
   * List all active sessions (admin utility)
   */
  getActiveSessions(req, res) {
    const activeSessions = Array.from(sessions.values()).map(session => ({
      id: session.id,
      username: session.username || 'unknown',
      createdAt: session.createdAt,
      ip: session.ip,
      userAgent: session.userAgent
    }));

    res.json({
      success: true,
      sessions: activeSessions,
      count: activeSessions.length
    });
  }

  /**
   * Clear all sessions (admin utility)
   */
  clearAllSessions(req, res) {
    const count = sessions.size;
    sessions.clear();

    logger.info(`Cleared ${count} admin sessions`);

    res.json({
      success: true,
      message: `Cleared ${count} sessions`
    });
  }
}

module.exports = new AdminAuth();
