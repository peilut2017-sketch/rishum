const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ymot/api';
const enc = encodeURIComponent;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body;
  if (!token) return res.json({ ok: false, message: 'נדרש token' });

  // Call RenderYMGRFile with a root path — any valid JSON response means
  // the API is reachable and the token is accepted.
  const url = `${API_BASE}/RenderYMGRFile?token=${enc(token)}&path=${enc('ivr2:/')}`;

  try {
    const r    = await fetch(url, { timeout: 8000 });
    const text = await r.text();

    if (!text || !text.trim()) {
      return res.json({ ok: false, message: 'השרת לא החזיר תגובה' });
    }

    // HTML → server/network error
    if (text.trimStart().startsWith('<')) {
      return res.json({ ok: false, message: 'לא ניתן להתחבר לשרת ימות המשיח' });
    }

    // Any non-HTML response (JSON or plain text) means we reached the API
    try {
      const json = JSON.parse(text);
      const msg  = (json.message || '').toLowerCase();
      // Auth-specific failures
      if (msg.includes('token') || msg.includes('auth') || msg.includes('login') || msg.includes('invalid')) {
        return res.json({ ok: false, message: 'מפתח API לא תקין — ' + json.message });
      }
    } catch { /* plain text is fine */ }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, message: e.message });
  }
};
