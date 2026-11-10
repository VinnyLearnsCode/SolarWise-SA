const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const apiRoutes = require('./src/routes');
const { errorHandler, notFound } = require('./src/middleware/errors');

const app = express();
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const publicPages = [
  'index.html', 'about.html', 'affordability.html', 'battery.html',
  'calculator.html', 'compare.html', 'contact.html', 'education.html',
  'energy-usage.html', 'faq.html', 'financing.html', 'off-grid.html',
  'planner.html', 'privacy.html', 'quotes.html', 'solar-explorer.html',
  'solar-map.html', 'tariff-simulator.html'
];

app.disable('x-powered-by');
app.use(helmet({
  referrerPolicy: { policy: 'strict-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(cors({ origin: allowedOrigin }));
app.use('/api/admin/tariffs/import', express.json({ limit: '256kb' }));
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
app.get('/robots.txt', (_req, res) => {
  const siteUrl = getPublicSiteUrl();
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /html/dashboard.html',
    `Sitemap: ${siteUrl}/sitemap.xml`
  ].join('\n'));
});
app.get('/sitemap.xml', (_req, res) => {
  const siteUrl = getPublicSiteUrl();
  const urls = publicPages.map((page) => `  <url><loc>${siteUrl}/html/${page}</loc></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});
app.use('/documentation', express.static(path.join(__dirname, '..', 'documentation')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/', (_req, res) => res.redirect('/html/index.html'));
app.use(notFound);
app.use(errorHandler);

module.exports = app;

function getPublicSiteUrl() {
  const candidate = process.env.PUBLIC_SITE_URL || allowedOrigin;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('PUBLIC_SITE_URL or FRONTEND_ORIGIN must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_SITE_URL or FRONTEND_ORIGIN must use HTTP or HTTPS.');
  }
  return url.origin;
}
