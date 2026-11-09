require('dotenv').config();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const email = z.string().trim().email().max(254).parse(process.env.ADMIN_EMAIL || '');
  const password = z.string().min(12).max(200).parse(process.env.ADMIN_PASSWORD || '');
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
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.administrator.upsert({
      where: { email: email.toLowerCase() },
      update: { passwordHash, authVersion: { increment: 1 } },
      create: { email: email.toLowerCase(), passwordHash, role: 'ADMIN' }
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
