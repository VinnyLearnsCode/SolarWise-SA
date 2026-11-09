const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !process.env.JWT_SECRET) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Administrator authentication is required.' } });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'ADMIN') throw new Error('Insufficient role');
    req.admin = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'The administrator token is invalid or expired.' } });
  }
}

module.exports = { requireAdmin };
