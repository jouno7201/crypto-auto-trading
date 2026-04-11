export async function api(url, opts = {}) {
  try {
    return await fetch(url, { ...opts, headers: { ...opts.headers } });
  } catch {
    return null;
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
