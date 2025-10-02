const { PrismaClient } = require('../generated/prisma');
const config = require('../config');

const logLevel = (config.logging?.level || 'info').toLowerCase();
const logOptions = ['error'];
if (logLevel === 'debug') {
  logOptions.push('query', 'warn');
} else if (logLevel === 'warn') {
  logOptions.push('warn');
}

const prismaGlobal = global.prisma;

const prisma = prismaGlobal || new PrismaClient({ log: logOptions });

if (config.nodeEnv !== 'production') {
  global.prisma = prisma;
}

module.exports = prisma;
