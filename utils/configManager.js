const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ACTIVE_QUARTER_KEY = 'active_quarter';

async function getActiveQuarter() {
  let config = await prisma.config.findUnique({ where: { key: ACTIVE_QUARTER_KEY } });
  if (!config) {
    // Default to Q1 if not set
    config = await prisma.config.create({ data: { key: ACTIVE_QUARTER_KEY, value: 'Q1' } });
  }
  return config.value;
}

async function setActiveQuarter(quarter) {
  await prisma.config.upsert({
    where: { key: ACTIVE_QUARTER_KEY },
    update: { value: quarter },
    create: { key: ACTIVE_QUARTER_KEY, value: quarter },
  });
  return quarter;
}

module.exports = {
  getActiveQuarter,
  setActiveQuarter,
}; 