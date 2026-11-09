const jwt = require('jsonwebtoken');
const { getPrisma } = require('../utils/prisma');

async function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Administrator authentication is required.' } });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_error) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'The administrator token is invalid or expired.' } });
  }

  if (typeof payload.sub !== 'string'
    || !payload.sub
    || payload.role !== 'ADMIN'
    || !Number.isInteger(payload.authVersion)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'The administrator token is invalid or expired.' } });
  }
  const administrator = await getPrisma().administrator.findUnique({
    where: { id: payload.sub },
    select: { role: true, authVersion: true }
  });
  if (!administrator
    || administrator.role !== 'ADMIN'
    || administrator.authVersion !== payload.authVersion) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'The administrator token is invalid or expired.' } });
  }
  req.admin = payload;
  return next();
}

module.exports = { requireAdmin };
