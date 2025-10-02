const database = require('../config/database');
const Logger = require('../utils/logger');
const config = require('../config');
const bcrypt = require('bcrypt');

const logger = new Logger(config.logging.level);
const SALT_ROUNDS = 10;

class AdminService {
  /**
   * Create a new admin user
   * @param {string} username - Admin username
   * @param {string} password - Plain text password (will be hashed)
   * @param {number|null} hours - Validity in hours (null for permanent)
   * @param {string} createdBy - Username of creator
   * @param {string} ipAddress - IP address
   * @returns {Promise<Object>} Created admin data
   */
  async createAdmin(username, password, hours, createdBy, ipAddress) {
    try {
      // Sanitize username
      const sanitizedUsername = username.trim().toLowerCase();

      // Check if username already exists
      const existing = await this.getAdminByUsername(sanitizedUsername);
      if (existing) {
        return {
          error: 'Unable to create admin user. Please try a different username.',
          code: 409
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Calculate expiration date
      const expiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;

      return new Promise((resolve, reject) => {
        const db = database.getDb();
        const sql = `INSERT INTO admin_users (username, password_hash, expires_at, created_by, ip_address)
                     VALUES (?, ?, ?, ?, ?)`;

        db.run(sql, [sanitizedUsername, passwordHash, expiresAt, createdBy, ipAddress], function(err) {
          if (err) {
            logger.error('Failed to create admin user:', err);
            reject(err);
            return;
          }

          logger.info('Admin user created successfully:', {
            id: this.lastID,
            username,
            createdBy
          });

          resolve({
            id: this.lastID,
            username: sanitizedUsername,
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
            status: 'active'
          });
        });
      });
    } catch (error) {
      logger.error('Error creating admin user:', error);
      throw error;
    }
  }

  /**
   * Get admin user by username
   * @param {string} username - Admin username
   * @returns {Promise<Object|null>} Admin user data or null
   */
  async getAdminByUsername(username) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const sql = 'SELECT * FROM admin_users WHERE username = ?';

      db.get(sql, [username], (err, row) => {
        if (err) {
          logger.error('Failed to fetch admin user:', err);
          reject(err);
          return;
        }

        resolve(row || null);
      });
    });
  }

  /**
   * Get admin user by ID
   * @param {number} id - Admin ID
   * @returns {Promise<Object|null>} Admin user data or null
   */
  async getAdminById(id) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const sql = 'SELECT * FROM admin_users WHERE id = ?';

      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Failed to fetch admin user by ID:', err);
          reject(err);
          return;
        }

        resolve(row || null);
      });
    });
  }

  /**
   * Get all admin users
   * @returns {Promise<Array>} Array of admin users (without password hashes)
   */
  async getAllAdmins() {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const sql = 'SELECT id, username, created_at, expires_at, status, created_by, last_login FROM admin_users ORDER BY created_at DESC';

      db.all(sql, [], (err, rows) => {
        if (err) {
          logger.error('Failed to fetch admin users:', err);
          reject(err);
          return;
        }

        const admins = rows.map(row => ({
          ...row,
          is_expired: row.expires_at ? new Date(row.expires_at) < new Date() : false,
          is_permanent: !row.expires_at
        }));

        resolve(admins);
      });
    });
  }

  /**
   * Validate admin credentials
   * @param {string} username - Admin username
   * @param {string} password - Plain text password
   * @returns {Promise<Object>} Validation result
   */
  async validateCredentials(username, password) {
    try {
      const admin = await this.getAdminByUsername(username);

      if (!admin) {
        return {
          valid: false,
          error: 'Invalid credentials',
          code: 401
        };
      }

      // Check if expired
      if (admin.expires_at && new Date(admin.expires_at) < new Date()) {
        return {
          valid: false,
          error: 'Admin account has expired',
          code: 403
        };
      }

      // Check if disabled
      if (admin.status !== 'active') {
        return {
          valid: false,
          error: 'Admin account is disabled',
          code: 403
        };
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, admin.password_hash);

      if (!passwordMatch) {
        return {
          valid: false,
          error: 'Invalid credentials',
          code: 401
        };
      }

      // Update last_login
      await this.updateLastLogin(admin.id);

      return {
        valid: true,
        admin: {
          id: admin.id,
          username: admin.username,
          status: admin.status
        }
      };
    } catch (error) {
      logger.error('Error validating admin credentials:', error);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   * @param {number} adminId - Admin ID
   * @returns {Promise<void>}
   */
  async updateLastLogin(adminId) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const sql = 'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?';

      db.run(sql, [adminId], function(err) {
        if (err) {
          logger.error('Failed to update last login:', err);
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Delete admin user
   * @param {number} id - Admin ID
   * @param {string} currentUsername - Username of the admin performing the deletion
   * @returns {Promise<Object>} Deletion result
   */
  async deleteAdmin(id, currentUsername) {
    try {
      const admin = await this.getAdminById(id);

      if (!admin) {
        return {
          error: 'Admin user not found',
          code: 404
        };
      }

      // Prevent self-deletion
      if (admin.username === currentUsername) {
        return {
          error: 'Cannot delete your own account',
          code: 403
        };
      }

      return new Promise((resolve, reject) => {
        const db = database.getDb();
        const sql = 'DELETE FROM admin_users WHERE id = ?';

        db.run(sql, [id], function(err) {
          if (err) {
            logger.error('Failed to delete admin user:', err);
            reject(err);
            return;
          }

          if (this.changes === 0) {
            resolve({
              error: 'Admin user not found',
              code: 404
            });
          } else {
            logger.info('Admin user deleted successfully:', { id, username: admin.username });
            resolve({ success: true });
          }
        });
      });
    } catch (error) {
      logger.error('Error deleting admin user:', error);
      throw error;
    }
  }

  /**
   * Update admin status
   * @param {number} id - Admin ID
   * @param {string} status - New status ('active', 'disabled')
   * @returns {Promise<Object>} Update result
   */
  async updateAdminStatus(id, status) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const sql = 'UPDATE admin_users SET status = ? WHERE id = ?';

      db.run(sql, [status, id], function(err) {
        if (err) {
          logger.error('Failed to update admin status:', err);
          reject(err);
          return;
        }

        if (this.changes === 0) {
          resolve({
            error: 'Admin user not found',
            code: 404
          });
        } else {
          logger.info('Admin status updated:', { id, status });
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * Get admin statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const db = database.getDb();

      db.get('SELECT COUNT(*) as total FROM admin_users', [], (err, totalRow) => {
        if (err) {
          reject(err);
          return;
        }

        db.get("SELECT COUNT(*) as active FROM admin_users WHERE status = 'active'", [], (err, activeRow) => {
          if (err) {
            reject(err);
            return;
          }

          db.get("SELECT COUNT(*) as expired FROM admin_users WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')", [], (err, expiredRow) => {
            if (err) {
              reject(err);
              return;
            }

            resolve({
              total: totalRow?.total || 0,
              active: activeRow?.active || 0,
              expired: expiredRow?.expired || 0
            });
          });
        });
      });
    });
  }
}

module.exports = new AdminService();
