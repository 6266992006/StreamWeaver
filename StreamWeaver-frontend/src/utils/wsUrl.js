// http://host:5000 -> ws://host:5000/ws/progress?token=...   (https -> wss)
export function toWsUrl(apiBase, token, path = '/ws/progress') {
  const base = String(apiBase || '').replace(/\/$/, '').replace(/^http/i, 'ws');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}
