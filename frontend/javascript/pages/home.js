const homeWeatherNode = document.getElementById('home-weather');
const weatherSourceNode = document.getElementById('weather-source');
SolarAPI.request('/weather?latitude=-26.2041&longitude=28.0473')
  .then(({ data, retrievedAt, source, cached, stale }) => {
    const current = data.current;
    homeWeatherNode.textContent = `${Math.round(current.temperature_2m)}°C · ${current.cloud_cover}% cloud`;
    weatherSourceNode.textContent = `${source} · Johannesburg · retrieved ${new Date(retrievedAt).toLocaleString('en-ZA')}${stale ? ' · stale cached data' : cached ? ' · cached' : ''}`;
  })
  .catch(() => {
    homeWeatherNode.textContent = 'Weather temporarily unavailable';
    weatherSourceNode.textContent = 'No live weather reading available. Try again later.';
  });
document.querySelectorAll('.sa-map button').forEach((button) => button.addEventListener('click', () => {
  window.location.href = `solar-explorer.html?place=${encodeURIComponent(button.dataset.place)}`;
}));
