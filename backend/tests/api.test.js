const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');

test('health endpoint responds without a database connection', async (context) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = '';
  const server = app.listen(0);
  context.after(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    return new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const homepage = await fetch(`${base}/html/index.html`);
  assert.equal(homepage.status, 200);
  const contentSecurityPolicy = homepage.headers.get('content-security-policy');
  assert.doesNotMatch(contentSecurityPolicy, /googletagmanager|google-analytics/);
  assert.equal(homepage.headers.get('referrer-policy'), 'strict-origin');
  const privacyNotice = await fetch(`${base}/html/privacy.html`);
  assert.equal(privacyNotice.status, 200);
  const privacyHtml = await privacyNotice.text();
  assert.match(privacyHtml, /Thabiso Monaheng/);
  assert.match(privacyHtml, /mailto:abutvincent23@gmail\.com/);
  assert.match(privacyHtml, /Google Tag Manager and other optional analytics are currently disabled/);
  assert.match(privacyHtml, /Feedback messages and any email address included with them are kept for 365 days/);
  assert.match(privacyHtml, /acknowledge requests within 5 business days/);
  assert.match(privacyHtml, /substantive response within 30 calendar days/);
  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow: \/html\/dashboard\.html/);
  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  const sitemapXml = await sitemap.text();
  assert.match(sitemapXml, /\/html\/calculator\.html/);
  assert.match(sitemapXml, /\/html\/quotes\.html/);
  assert.doesNotMatch(sitemapXml, /dashboard\.html/);
  const publicPages = [
    'index.html', 'about.html', 'affordability.html', 'battery.html',
    'calculator.html', 'compare.html', 'contact.html', 'education.html',
    'energy-usage.html', 'faq.html', 'financing.html', 'off-grid.html',
    'planner.html', 'privacy.html', 'quotes.html', 'solar-explorer.html'
  ];
  for (const page of publicPages) {
    const response = await fetch(`${base}/html/${page}`);
    assert.equal(response.status, 200, `${page} should be served`);
    const html = await response.text();
    assert.match(html, /<title>[^<]+<\/title>/, `${page} should have a title`);
    assert.match(html, /<meta name="description" content="[^"]+">/, `${page} should have a description`);
    assert.match(html, /<link rel="canonical" href="https:\/\/solarwise-sa-vinny-preview\.onrender\.com\/html\/[^"]+">/, `${page} should have a canonical URL`);
    assert.match(html, /<meta property="og:description" content="[^"]+">/, `${page} should have social description metadata`);
    assert.doesNotMatch(html, /<script[^>]+src="https:\/\/www\.googletagmanager\.com/, `${page} must not load GTM directly`);
    assert.doesNotMatch(html, /privacy-controls|privacy-settings-panel|data-gtm-container|GTM-PQRTDNDG/, `${page} must not expose disabled analytics UI or tags`);
    assert.match(html, /<main\b/, `${page} should have a main landmark`);
    if (page === 'planner.html') {
      assert.match(html, /id="monthly-bill" type="number" min="1" step="any"/, 'monthly bill should accept arbitrary positive amounts');
    }
  }
  const dashboard = await fetch(`${base}/html/dashboard.html`);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(dashboardHtml, /rel="canonical"/);
  const missingPage = await fetch(`${base}/this-page-does-not-exist`, { headers: { accept: 'text/html' } });
  assert.equal(missingPage.status, 404);
  assert.match(await missingPage.text(), /That page isn't/);
  const missingApi = await fetch(`${base}/api/this-route-does-not-exist`);
  assert.equal(missingApi.status, 404);
  assert.equal((await missingApi.json()).error.code, 'NOT_FOUND');

  const readiness = await fetch(`${base}/api/health/ready`);
  assert.equal(readiness.status, 503);
  assert.equal((await readiness.json()).database.status, 'not_configured');

  const solar = await fetch(`${base}/api/calculations/solar`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      monthlyBill: 2500, monthlyConsumption: 600, tariff: 3.5,
      systemKw: 5, installationCost: 140000
    })
  });
  assert.equal(solar.status, 200);
  assert.equal((await solar.json()).result.currency, 'ZAR');

  const loan = await fetch(`${base}/api/calculations/loan`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ systemCost: 12000, deposit: 2000, annualInterestRate: 0, termMonths: 10 })
  });
  assert.equal(loan.status, 200);
  assert.equal((await loan.json()).result.monthlyRepayment, 1000);

  const savings = await fetch(`${base}/api/calculations/affordability`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentSavings: 0, monthlySaving: 500, targetCost: 6000 })
  });
  assert.equal(savings.status, 200);
  assert.equal((await savings.json()).result.monthsToTarget, 12);

  const usage = await fetch(`${base}/api/calculations/usage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tariff: 3, appliances: [{ name: 'Kettle', watts: 2000, quantity: 1, hoursPerDay: 0.2, daysPerMonth: 30 }]
    })
  });
  assert.equal(usage.status, 200);
  assert.equal((await usage.json()).result.monthlyKwh, 12);

  const battery = await fetch(`${base}/api/calculations/battery`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hours: 5, appliances: [{ watts: 100, quantity: 2, hours: 5 }] })
  });
  assert.equal(battery.status, 200);
  assert.ok((await battery.json()).result.recommendedBatteryKwh > 1);

  const invalid = await fetch(`${base}/api/calculations/solar`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ monthlyBill: -1 })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
});
