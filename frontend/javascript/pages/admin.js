const loginForm = document.getElementById('admin-login');
loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(loginForm));
  const errorNode = document.getElementById('admin-error');
  errorNode.textContent = '';
  try {
    const { token, email } = await SolarAPI.post('/admin/login', values);
    sessionStorage.setItem('solarwise-admin-token', token);
    sessionStorage.setItem('solarwise-admin-email', email);
    await loadOverview(token);
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    loginForm.querySelector('[name="password"]').value = '';
  }
});

async function loadOverview(token, notice = '') {
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [overview, provinceData, municipalityData, tariffData] = await Promise.all([
      SolarAPI.request('/admin/overview', { headers }),
      SolarAPI.request('/admin/provinces', { headers }),
      SolarAPI.request('/admin/municipalities', { headers }),
      SolarAPI.request('/admin/tariffs', { headers })
    ]);
    const section = document.getElementById('admin-overview');
    section.hidden = false;
    section.innerHTML = `
      <h2>Platform overview</h2>
      <div class="admin-stats">${Object.entries(overview.counts).map(([label, count]) => `<div class="admin-stat"><small>${SolarFormat.escape(label)}</small><strong>${SolarFormat.number(count)}</strong></div>`).join('')}</div>
      <p class="form-error" id="admin-message" role="status">${SolarFormat.escape(notice)}</p>
      <form id="admin-credentials-form" class="form-panel admin-credentials">
        <h2>Change administrator credentials</h2>
        <p>Signed in as <strong>${SolarFormat.escape(sessionStorage.getItem('solarwise-admin-email') || 'Administrator')}</strong>. Verify your current password to change your email, password, or both. Updating credentials signs out other active sessions.</p>
        <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="200"></label>
        <label>New email <span class="hint">leave blank to keep the current email</span><input name="newEmail" type="email" autocomplete="email" maxlength="254"></label>
        <label>New password <span class="hint">leave blank to keep the current password; at least 12 characters</span><input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="200"></label>
        <label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="200"></label>
        <button class="button secondary" type="submit">Update credentials</button>
        <p class="form-error" id="admin-credentials-message" role="status" aria-live="polite"></p>
      </form>
      <div class="admin-management">
        <form id="municipality-form" class="form-panel">
          <h2>Add municipality</h2>
          <label>Municipality name<input name="name" required minlength="2" maxlength="120"></label>
          <label>Province<select name="provinceId" required>${provinceData.provinces.map((province) => `<option value="${SolarFormat.escape(province.id)}">${SolarFormat.escape(province.name)}</option>`).join('')}</select></label>
          <button class="button secondary" type="submit">Add municipality</button>
        </form>
        <form id="admin-tariff-form" class="form-panel">
          <h2>Publish a verified tariff</h2>
          <label>Municipality<select name="municipalityId" required>${municipalityData.municipalities.map((municipality) => `<option value="${SolarFormat.escape(municipality.id)}">${SolarFormat.escape(municipality.name)} · ${SolarFormat.escape(municipality.province.name)}</option>`).join('')}</select></label>
          <label>Tariff name<input name="name" required maxlength="120"></label>
          <label>Customer category<input name="customerCategory" required maxlength="80" placeholder="Residential"></label>
          <div class="field-grid">
            <label>Effective from<input name="effectiveFrom" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
            <label>Last verified<input name="lastVerifiedAt" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
            <label>Fixed monthly charge (R)<input name="fixedMonthlyCharge" type="number" min="0" step="0.01" value="0" required></label>
            <label>Energy charge (R/kWh)<input name="energyChargePerKwh" type="number" min="0" step="0.0001" required></label>
            <label>Feed-in rate (R/kWh)<input name="feedInRatePerKwh" type="number" min="0" step="0.0001"></label>
          </div>
          <label>Time-of-use rates <span class="hint">optional JSON object, e.g. {"peak":5.2,"offPeak":1.8}</span><textarea name="timeOfUseRates" rows="2"></textarea></label>
          <label>Source URL<input name="sourceUrl" type="url" required maxlength="500"></label>
          <button class="button primary" type="submit" ${municipalityData.municipalities.length ? '' : 'disabled'}>Publish tariff</button>
        </form>
      </div>
      <h2>Tariff records</h2>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Municipality</th><th>Tariff</th><th>Category</th><th>Charges (R)</th><th>Effective</th><th>Source / verified</th><th>Action</th></tr></thead><tbody>${tariffData.tariffs.map((tariff) => `
        <tr><td>${SolarFormat.escape(tariff.municipality.name)} · ${SolarFormat.escape(tariff.municipality.province.name)}</td>
        <td>${SolarFormat.escape(tariff.name)}</td><td>${SolarFormat.escape(tariff.customerCategory)}</td>
        <td>${SolarFormat.number(Number(tariff.fixedMonthlyCharge), 2)} / month<br>${SolarFormat.number(Number(tariff.energyChargePerKwh), 4)} / kWh</td>
        <td>${new Date(tariff.effectiveFrom).toLocaleDateString('en-ZA')} – ${tariff.effectiveTo ? new Date(tariff.effectiveTo).toLocaleDateString('en-ZA') : 'open'}</td>
        <td><a href="${SolarFormat.escape(tariff.sourceUrl)}" target="_blank" rel="noreferrer">Source ↗</a><br>Verified ${new Date(tariff.lastVerifiedAt).toLocaleDateString('en-ZA')}</td>
        <td>${tariff.effectiveTo ? 'Historical' : `<form class="close-tariff-form" data-id="${SolarFormat.escape(tariff.id)}"><input name="effectiveTo" aria-label="End date for ${SolarFormat.escape(tariff.name)}" type="date" required><button class="button secondary" type="submit">End tariff</button></form>`}</td></tr>`).join('') || '<tr><td colspan="7">No tariff records yet. Add a verified source above.</td></tr>'}</tbody></table></div>
      <p class="assumptions">Tariffs are administrator-maintained. Publish only verified schedules, retain historical effective dates, and re-check official source documents before use.</p>
      <button class="button secondary" id="admin-logout" type="button">Sign out</button>`;
    loginForm.hidden = true;
    document.getElementById('admin-logout').addEventListener('click', () => {
      sessionStorage.removeItem('solarwise-admin-token');
      sessionStorage.removeItem('solarwise-admin-email');
      section.hidden = true;
      loginForm.hidden = false;
    });
    document.getElementById('admin-credentials-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      const message = form.querySelector('#admin-credentials-message');
      message.textContent = '';
      try {
        if (values.newPassword !== values.confirmPassword) {
          throw new Error('The new passwords do not match.');
        }
        if (!values.newEmail.trim() && !values.newPassword) {
          throw new Error('Enter a new email address, a new password, or both.');
        }
        const result = await SolarAPI.request('/admin/credentials', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            currentPassword: values.currentPassword,
            ...(values.newEmail.trim() ? { newEmail: values.newEmail.trim() } : {}),
            ...(values.newPassword ? { newPassword: values.newPassword } : {})
          })
        });
        sessionStorage.setItem('solarwise-admin-token', result.token);
        sessionStorage.setItem('solarwise-admin-email', result.email);
        await loadOverview(result.token, 'Credentials updated. Other active sessions have been signed out.');
      } catch (error) {
        message.textContent = error.message;
      } finally {
        form.querySelector('[name="currentPassword"]').value = '';
        form.querySelector('[name="newPassword"]').value = '';
        form.querySelector('[name="confirmPassword"]').value = '';
      }
    });
    document.getElementById('municipality-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      await mutateAdmin(token, () => SolarAPI.post('/admin/municipalities', data));
    });
    document.getElementById('admin-tariff-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      try {
        const timeOfUseRates = data.timeOfUseRates.trim() ? JSON.parse(data.timeOfUseRates) : undefined;
        const payload = {
          ...data,
          fixedMonthlyCharge: Number(data.fixedMonthlyCharge),
          energyChargePerKwh: Number(data.energyChargePerKwh),
          ...(data.feedInRatePerKwh ? { feedInRatePerKwh: Number(data.feedInRatePerKwh) } : {}),
          ...(timeOfUseRates === undefined ? {} : { timeOfUseRates })
        };
        await mutateAdmin(token, () => SolarAPI.post('/admin/tariffs', payload));
      } catch (error) {
        section.querySelector('#admin-message').textContent = error instanceof SyntaxError
          ? 'Time-of-use rates must be valid JSON.'
          : error.message;
      }
    });
    section.querySelectorAll('.close-tariff-form').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const effectiveTo = new FormData(form).get('effectiveTo');
      await mutateAdmin(token, () => SolarAPI.post(`/admin/tariffs/${encodeURIComponent(form.dataset.id)}/close`, { effectiveTo }));
    }));
  } catch (error) {
    sessionStorage.removeItem('solarwise-admin-token');
    sessionStorage.removeItem('solarwise-admin-email');
    document.getElementById('admin-overview').hidden = true;
    loginForm.hidden = false;
    document.getElementById('admin-error').textContent = error.message;
  }
}

async function mutateAdmin(token, operation) {
  const message = document.getElementById('admin-message');
  try {
    await operation();
    await loadOverview(token, 'Record saved.');
  } catch (error) {
    message.textContent = error.message;
  }
}

const existingToken = sessionStorage.getItem('solarwise-admin-token');
if (existingToken) loadOverview(existingToken);
