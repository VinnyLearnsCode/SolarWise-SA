const storageKey = 'solarwise-installer-quotes';
const quoteGrid = document.getElementById('quote-grid');
const quoteStatus = document.getElementById('quote-status');
const quoteFields = [
  { name: 'installer', label: 'Installer / proposal label', type: 'text', maxLength: 80 },
  { name: 'totalCost', label: 'Total installed price (R)', type: 'number', min: 0, step: 1 },
  { name: 'solarKw', label: 'Solar capacity (kWp)', type: 'number', min: 0, step: 0.1 },
  { name: 'batteryKwh', label: 'Battery capacity (kWh)', type: 'number', min: 0, step: 0.1 },
  { name: 'annualKwh', label: 'Estimated annual production (kWh)', type: 'number', min: 0, step: 1 },
  { name: 'panelWarranty', label: 'Panel product / performance warranty', type: 'text', maxLength: 120 },
  { name: 'inverterWarranty', label: 'Inverter warranty', type: 'text', maxLength: 120 },
  { name: 'batteryWarranty', label: 'Battery warranty', type: 'text', maxLength: 120 },
  { name: 'included', label: 'Included equipment and services', type: 'textarea', maxLength: 1000 },
  { name: 'excluded', label: 'Exclusions, recurring fees and assumptions', type: 'textarea', maxLength: 1000 },
  { name: 'validUntil', label: 'Quote valid until', type: 'date' },
  { name: 'notes', label: 'Questions to verify', type: 'textarea', maxLength: 1000 }
];

let quotes = loadQuotes();
renderQuotes();

quoteGrid.addEventListener('input', (event) => {
  const field = event.target.closest('[data-quote-field]');
  if (!field) return;
  const card = field.closest('[data-quote-index]');
  const quote = quotes[Number(card.dataset.quoteIndex)];
  quote[field.dataset.quoteField] = field.value;
  updatePricePerKw(card, quote);
  saveQuotes();
});

quoteGrid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const index = Number(button.closest('[data-quote-index]').dataset.quoteIndex);
  if (button.dataset.action === 'clear') {
    quotes[index] = emptyQuote();
    saveQuotes();
    renderQuotes();
  }
});

document.getElementById('quote-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: 'solarwise-installer-quotes', version: 1, exportedAt: new Date().toISOString(), quotes }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'solarwise-quote-comparison.json';
  link.click();
  URL.revokeObjectURL(url);
});
document.getElementById('quote-print').addEventListener('click', () => window.print());
document.getElementById('quote-clear').addEventListener('click', () => {
  if (!window.confirm('Clear all three quote cards saved on this device? This cannot be undone.')) return;
  quotes = Array.from({ length: 3 }, emptyQuote);
  saveQuotes();
  renderQuotes();
});

function emptyQuote() {
  return Object.fromEntries(quoteFields.map((field) => [field.name, '']));
}

function loadQuotes() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return Array.from({ length: 3 }, emptyQuote);
    const value = JSON.parse(stored);
    if (!Array.isArray(value) || value.length !== 3 || value.some((quote) => !quote || typeof quote !== 'object')) {
      throw new Error('Stored quote worksheet data has an unexpected format.');
    }
    return value.map((quote) => Object.fromEntries(quoteFields.map((field) => [
      field.name,
      typeof quote[field.name] === 'string' || typeof quote[field.name] === 'number' ? String(quote[field.name]) : ''
    ])));
  } catch (error) {
    quoteStatus.textContent = `Could not read the saved worksheet: ${error.message}`;
    return Array.from({ length: 3 }, emptyQuote);
  }
}

function saveQuotes() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(quotes));
    quoteStatus.textContent = 'Changes saved on this device only. No quote information is uploaded.';
  } catch (error) {
    quoteStatus.textContent = `Could not save your changes on this device: ${error.message}`;
  }
}

function renderQuotes() {
  quoteGrid.replaceChildren();
  quotes.forEach((quote, index) => {
    const card = document.createElement('section');
    card.className = 'quote-card';
    card.dataset.quoteIndex = String(index);
    const heading = document.createElement('h2');
    heading.textContent = `Proposal ${index + 1}`;
    card.append(heading);
    quoteFields.forEach((field) => {
      const label = document.createElement('label');
      label.textContent = field.label;
      const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
      if (field.type !== 'textarea') input.type = field.type;
      input.dataset.quoteField = field.name;
      input.value = quote[field.name];
      if (field.maxLength) input.maxLength = field.maxLength;
      if (field.min !== undefined) input.min = String(field.min);
      if (field.step) input.step = String(field.step);
      label.append(input);
      card.append(label);
    });
    const total = document.createElement('p');
    total.className = 'quote-total-output';
    const totalHeading = document.createElement('span');
    totalHeading.className = 'quote-total';
    totalHeading.textContent = 'Price per kWp';
    const amount = document.createElement('span');
    amount.dataset.pricePerKw = 'true';
    total.append(totalHeading, document.createElement('br'), amount);
    card.append(total);
    updatePricePerKw(card, quote);
    const actions = document.createElement('div');
    actions.className = 'quote-actions';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'button secondary';
    clear.dataset.action = 'clear';
    clear.textContent = 'Clear this proposal';
    actions.append(clear);
    card.append(actions);
    quoteGrid.append(card);
  });
}

function updatePricePerKw(card, quote) {
  const amount = card.querySelector('[data-price-per-kw]');
  if (!amount) return;
  amount.textContent = quote.totalCost && quote.solarKw && Number(quote.solarKw) > 0
    ? SolarFormat.money(Number(quote.totalCost) / Number(quote.solarKw))
    : 'Enter a total price and solar capacity';
}
