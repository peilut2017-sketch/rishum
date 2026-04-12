const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body;
  if (!token) return res.json({ ok: false, message: 'נדרש token' });

  // Send a minimal request — any JSON response (even an error) means
  // the API is reachable and the token was accepted at the HTTP level.
  // Only an HTML page or network failure means the token/connection is bad.
  const body = new URLSearchParams({ wath: 'ivr2:_check_', convertType: 'json', token });

  try {
    const r    = await fetch(`${API_BASE}/RenderYMGRFile`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', authorization: token },
      body:    body.toString(),
    });
    const text = await r.text();

    if (!text || !text.trim()) {
      return res.json({ ok: false, message: 'השרת לא החזיר תגובה' });
    }

    // HTML response = server/proxy error (not from the API itself)
    if (text.trimStart().startsWith('<')) {
      return res.json({ ok: false, message: 'לא ניתן להגיע לשרת ימות המשיח' });
    }

    // Any JSON response (OK or error) = token was accepted, API is reachable
    res.json({ ok: true });

  } catch (e) {
    res.status(502).json({ ok: false, message: e.message });
  }
};
