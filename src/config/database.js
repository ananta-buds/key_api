const prisma = require('./prisma');
const Logger = require('../utils/logger');
const config = require('../config');

const logger = new Logger(config.logging.level);

module.exports = {
  async connect() {
    logger.debug('Connecting to Prisma database client');
    await prisma.$connect();
  },

  async close() {
    logger.debug('Disconnecting Prisma database client');
    await prisma.$disconnect();
  },

  getDb() {
    throw new Error('SQLite database has been removed. Use the Prisma client via config/prisma.js');
  }
};
