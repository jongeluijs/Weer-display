// Frontend API helper. Cached laatste succesvolle response voor fallback.

let lastWeather = null;

export async function getWeather() {
  try {
    const res = await fetch('/api/weather', { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    lastWeather = data;
    return data;
  } catch (err) {
    if (lastWeather) {
      return { ...lastWeather, stale: true, _fetchError: err.message };
    }
    throw err;
  }
}

export async function getHistory(range = 'daily') {
  const res = await fetch(`/api/history?range=${encodeURIComponent(range)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export function startPolling({ intervalMs, onUpdate, onError }) {
  let timer = null;
  let stopped = false;

  async function tick() {
    try {
      const data = await getWeather();
      if (!stopped) onUpdate?.(data);
    } catch (err) {
      if (!stopped) onError?.(err);
    }
  }

  tick();
  timer = setInterval(tick, intervalMs);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}
