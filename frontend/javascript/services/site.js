(() => {
  window.SolarAPI = {
    async request(path, options = {}) {
      const response = await fetch(`/api${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error?.message || `Request failed (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return body;
    },
    post(path, payload) {
      return window.SolarAPI.request(path, { method: 'POST', body: JSON.stringify(payload) });
    }
  };
  window.SolarFormat = {
    money(value) {
      return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value);
    },
    number(value, digits = 0) {
      return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: digits }).format(value);
    },
    escape(value) {
      return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }
  };
  const savedTheme = localStorage.getItem('solarwise-theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = savedTheme || (systemDark ? 'dark' : 'light');

  document.querySelectorAll('.theme-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('solarwise-theme', theme);
    });
  });
  document.querySelectorAll('.menu-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const nav = document.querySelector('.nav-links');
      if (!nav) return;
      const isOpen = nav.classList.toggle('open');
      button.setAttribute('aria-expanded', String(isOpen));
    });
  });

  initializeAnalyticsConsent();

  function initializeAnalyticsConsent() {
    const storageKey = 'solarwise-analytics-consent';
    const containerId = 'GTM-PQRTDNDG';
    let consent = null;
    let storageAvailable = true;

    let savedValue = null;
    try {
      savedValue = localStorage.getItem(storageKey);
    } catch {
      storageAvailable = false;
    }
    if (savedValue) {
      try {
        const saved = JSON.parse(savedValue);
        if (saved?.version === 1 && ['accepted', 'rejected'].includes(saved.choice)) consent = saved.choice;
      } catch {
        consent = null;
      }
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'granted',
      security_storage: 'granted'
    });

    const controls = document.createElement('section');
    controls.className = 'privacy-controls';
    controls.innerHTML = `
      <button class="privacy-settings-toggle" type="button" aria-expanded="false" aria-controls="privacy-settings-panel">Privacy settings</button>
      <div class="privacy-settings-panel" id="privacy-settings-panel" role="region" aria-label="Analytics privacy choices" hidden>
        <h2>Choose optional analytics</h2>
        <p>SolarWise uses Google Tag Manager for optional site analytics only after you accept. Analytics may use cookies and send page and interaction data to Google. Calculators work if you decline.</p>
        <p><a href="privacy.html">Read the privacy notice</a>. You can change your choice here at any time.</p>
        <p class="privacy-consent-status" role="status" aria-live="polite"></p>
        <div class="privacy-settings-actions">
          <button class="button secondary privacy-reject" type="button">Continue without analytics</button>
          <button class="button primary privacy-accept" type="button">Accept analytics</button>
        </div>
      </div>`;
    document.body.append(controls);

    const panel = controls.querySelector('.privacy-settings-panel');
    const toggle = controls.querySelector('.privacy-settings-toggle');
    const status = controls.querySelector('.privacy-consent-status');

    function showPanel(shouldFocus = true) {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      if (shouldFocus) controls.querySelector(consent === 'accepted' ? '.privacy-accept' : '.privacy-reject').focus();
    }

    function hidePanel() {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    function loadTagManager() {
      if (window.location.pathname.endsWith('/dashboard.html')
        || document.querySelector(`script[data-gtm-container="${containerId}"]`)) return;
      const script = document.createElement('script');
      script.async = true;
      script.dataset.gtmContainer = containerId;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode.insertBefore(script, firstScript);
    }

    function setConsent(choice) {
      if (!storageAvailable) {
        status.textContent = 'Your browser is not allowing this choice to be saved. Analytics will remain disabled until your choice can be saved.';
        return;
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, choice, updatedAt: new Date().toISOString() }));
      } catch {
        storageAvailable = false;
        status.textContent = 'Your browser is not allowing this choice to be saved. Analytics will remain disabled until your choice can be saved.';
        return;
      }
      consent = choice;
      window.gtag('consent', 'update', {
        analytics_storage: choice === 'accepted' ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
      if (choice === 'accepted') loadTagManager();
      status.textContent = choice === 'accepted'
        ? 'Optional analytics accepted. You can withdraw consent here at any time.'
        : 'Optional analytics declined. SolarWise calculators and planning tools remain available.';
      hidePanel();
      toggle.focus();
    }

    toggle.addEventListener('click', () => {
      if (panel.hidden) showPanel();
      else hidePanel();
    });
    document.getElementById('privacy-review')?.addEventListener('click', showPanel);
    controls.querySelector('.privacy-accept').addEventListener('click', () => setConsent('accepted'));
    controls.querySelector('.privacy-reject').addEventListener('click', () => setConsent('rejected'));

    if (consent === 'accepted') {
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
      loadTagManager();
    }
    if (!consent) showPanel(false);
    else status.textContent = consent === 'accepted' ? 'Optional analytics are enabled.' : 'Optional analytics are disabled.';
    if (window.location.pathname.endsWith('/dashboard.html')) controls.hidden = true;
  }
})();
