(() => {
  const mainContent = document.querySelector('main');
  if (mainContent) {
    if (!mainContent.id) mainContent.id = 'main-content';
    mainContent.tabIndex = -1;
    const skipLink = document.createElement('a');
    skipLink.className = 'skip-link';
    skipLink.href = `#${mainContent.id}`;
    skipLink.textContent = 'Skip to main content';
    document.body.prepend(skipLink);
  }

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
  const footer = document.querySelector('.footer-row');
  if (footer && !footer.querySelector('a[href="/html/privacy.html"]')) {
    const privacyLink = document.createElement('a');
    privacyLink.href = '/html/privacy.html';
    privacyLink.textContent = 'Privacy';
    footer.append(privacyLink);
  }
})();
