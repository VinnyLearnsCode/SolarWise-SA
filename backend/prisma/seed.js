require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

async function main() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters before seeding.');
  }
  const prisma = new PrismaClient();
  try {
    const provinces = [
      ['Eastern Cape', 'EC'], ['Free State', 'FS'], ['Gauteng', 'GP'],
      ['KwaZulu-Natal', 'KZN'], ['Limpopo', 'LP'], ['Mpumalanga', 'MP'],
      ['Northern Cape', 'NC'], ['North West', 'NW'], ['Western Cape', 'WC']
    ];
    await Promise.all(provinces.map(([name, code]) => prisma.province.upsert({
      where: { code }, update: { name }, create: { name, code }
    })));
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await prisma.administrator.upsert({
      where: { email: process.env.ADMIN_EMAIL.toLowerCase() },
      update: { passwordHash },
      create: { email: process.env.ADMIN_EMAIL.toLowerCase(), passwordHash, role: 'ADMIN' }
    });
    console.log('Administrator account configured.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
