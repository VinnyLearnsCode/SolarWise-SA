document.getElementById('feedback-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const messageNode = document.getElementById('feedback-message');
  const data = Object.fromEntries(new FormData(form));
  try {
    await SolarAPI.post('/feedback', { message: data.message.trim(), ...(data.email ? { email: data.email } : {}) });
    messageNode.textContent = 'Thank you. Your feedback has been received.';
    form.reset();
  } catch (error) {
    messageNode.textContent = error.message;
  }
});
