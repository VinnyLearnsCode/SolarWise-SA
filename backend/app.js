const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const apiRoutes = require('./src/routes');
const { errorHandler, notFound } = require('./src/middleware/errors');

const app = express();
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://www.googletagmanager.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://region1.google-analytics.com'],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/admin/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));
app.use('/api', apiRoutes);
app.use('/documentation', express.static(path.join(__dirname, '..', 'documentation')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/', (_req, res) => res.redirect('/html/index.html'));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
