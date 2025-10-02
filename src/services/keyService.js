const prisma = require('../config/prisma');
const { generateKey, getExpirationDate, isKeyValid, getRemainingTime } = require('../utils/keyUtils');
const Logger = require('../utils/logger');
const config = require('../config');

const logger = new Logger(config.logging.level);
const STATUS_ACTIVE = 'ACTIVE';

function mapAccessKeyRecord(record) {
  if (!record) return null;

  return {
    id: record.id,
    key_id: record.keyId,
    user_id: record.userId,
    status: (record.status || STATUS_ACTIVE).toLowerCase(),
    created_at: record.createdAt.toISOString(),
    expires_at: record.expiresAt.toISOString(),
    last_accessed: record.lastAccessed ? record.lastAccessed.toISOString() : null,
    usage_count: record.usageCount,
    ip_address: record.ipAddress,
    created_by: record.createdById
  };
}

class KeyService {
  /**
   * Create a new access key
   * @param {string} userId
   * @param {number} hours
   * @param {string} ipAddress
   */
  async createKey(userId, hours, ipAddress, createdById = null) {
    const existing = await this.getActiveKeyForUser(userId);
    if (existing) {
      const timeInfo = getRemainingTime(existing.expires_at);
      logger.warn('User attempted to create a key while having an active one', { userId, keyId: existing.key_id });
      return {
        error: 'User already has an active key',
        code: 409,
        data: {
          key_id: existing.key_id,
          user_id: existing.user_id,
          expires_at: existing.expires_at,
          time_remaining: timeInfo
        }
      };
    }

    const keyId = generateKey();
    const expiresAtIso = getExpirationDate(hours);

    const createdKey = await prisma.accessKey.create({
      data: {
        keyId,
        userId,
        expiresAt: new Date(expiresAtIso),
        ipAddress,
        status: STATUS_ACTIVE,
        createdById
      }
    });

    logger.info('Key created successfully', {
      keyId,
      userId,
      hours,
      ipAddress
    });

    return {
      key_id: createdKey.keyId,
      user_id: createdKey.userId,
      expires_at: createdKey.expiresAt.toISOString(),
      valid_for_hours: hours
    };
  }

  async getKeyById(keyId) {
    const record = await prisma.accessKey.findUnique({
      where: { keyId }
    });

    return mapAccessKeyRecord(record);
  }

  async getActiveKeyForUser(userId) {
    const record = await prisma.accessKey.findFirst({
      where: {
        userId,
        status: STATUS_ACTIVE,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    const mapped = mapAccessKeyRecord(record);
    if (mapped && isKeyValid(mapped)) {
      return mapped;
    }

    return null;
  }

  async validateKey(keyId) {
    try {
      const key = await this.getKeyById(keyId);

      if (!key) {
        return {
          valid: false,
          error: 'Key not found',
          code: 404
        };
      }

      const valid = isKeyValid(key);
      const timeInfo = getRemainingTime(key.expires_at);

      let usageCount = key.usage_count;
      if (valid) {
        const updated = await prisma.accessKey.update({
          where: { keyId },
          data: {
            usageCount: { increment: 1 },
            lastAccessed: new Date()
          }
        });
        usageCount = updated.usageCount;
      }

      return {
        valid,
        key_id: keyId,
        user_id: key.user_id,
        status: key.status,
        created_at: key.created_at,
        expires_at: key.expires_at,
        time_remaining: timeInfo,
        usage_count: usageCount,
        code: valid ? 200 : 410
      };
    } catch (error) {
      logger.error('Error validating key:', error);
      throw error;
    }
  }

  async updateKeyUsage(keyId) {
    await prisma.accessKey.update({
      where: { keyId },
      data: {
        usageCount: { increment: 1 },
        lastAccessed: new Date()
      }
    });
  }

  async getUserKeys(userId) {
    const records = await prisma.accessKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    const keys = records.map((record) => {
      const mapped = mapAccessKeyRecord(record);
      const valid = isKeyValid(mapped);
      const timeInfo = getRemainingTime(mapped.expires_at);

      return {
        key_id: mapped.key_id,
        user_id: mapped.user_id,
        valid,
        status: mapped.status,
        created_at: mapped.created_at,
        expires_at: mapped.expires_at,
        time_remaining: timeInfo,
        usage_count: mapped.usage_count,
        last_accessed: mapped.last_accessed
      };
    });

    logger.debug('Retrieved user keys', {
      userId,
      keyCount: keys.length
    });

    return keys;
  }

  async getKeyInfo(keyId) {
    try {
      const key = await this.getKeyById(keyId);

      if (!key) {
        return {
          error: 'Key not found',
          code: 404
        };
      }

      const valid = isKeyValid(key);
      const timeInfo = getRemainingTime(key.expires_at);

      return {
        msg: valid ? 'Key is active' : 'Key is expired or inactive',
        code: valid ? 200 : 410,
        data: {
          key_id: keyId,
          user_id: key.user_id,
          valid,
          status: key.status,
          created_at: key.created_at,
          expires_at: key.expires_at,
          time_remaining: timeInfo,
          usage_count: key.usage_count,
          last_accessed: key.last_accessed
        }
      };
    } catch (error) {
      logger.error('Error getting key info:', error);
      throw error;
    }
  }

  async deleteKey(keyId) {
    try {
      await prisma.accessKey.delete({
        where: { keyId }
      });

      logger.info('Key deleted successfully', { keyId });
      return { success: true };
    } catch (error) {
      if (error?.code === 'P2025') {
        return { error: 'Key not found', code: 404 };
      }

      logger.error('Failed to delete key:', error);
      return { error: 'Failed to delete key', code: 500 };
    }
  }

  async getTotalKeysCount() {
    return prisma.accessKey.count();
  }

  async getActiveKeysCount() {
    return prisma.accessKey.count({
      where: {
        status: STATUS_ACTIVE,
        expiresAt: { gt: new Date() }
      }
    });
  }

  async getExpiredKeysCount() {
    return prisma.accessKey.count({
      where: {
        OR: [
          { expiresAt: { lte: new Date() } },
          { status: 'EXPIRED' }
        ]
      }
    });
  }

  async getRecentKeys(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const records = await prisma.accessKey.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' }
    });

    return records.map(mapAccessKeyRecord);
  }
}

module.exports = new KeyService();
