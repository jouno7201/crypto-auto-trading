const API_TIMEOUT = 15000; // 15초

export async function api(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: controller.signal, headers: { ...opts.headers } });
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[api] 요청 타임아웃:', url);
    } else {
      console.warn('[api] 네트워크 오류:', url, e.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiJson(url, opts = {}) {
  const res = await api(url, opts);
  if (!res) return null;
  if (!res.ok) return res;
  return res.json();
}

export async function postJson(url, body) {
  return api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
