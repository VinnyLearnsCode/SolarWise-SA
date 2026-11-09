const faqSearch = document.getElementById('faq-search');
faqSearch?.addEventListener('input', () => {
  const query = faqSearch.value.trim().toLowerCase();
  document.querySelectorAll('#faq-list details').forEach((item) => {
    item.hidden = !item.textContent.toLowerCase().includes(query);
  });
});
