const fetch = require('node-fetch');

const API_BASE = 'https://www.call2all.co.il/ym/api';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { token } = req.body;
  if (!token) return res.json({ ok: false, message: 'נדרש token' });

  // Call RenderYMGRFile with a dummy path.
  // - If token is INVALID  → responseStatus error about auth/token
  // - If token is VALID    → responseStatus error about path (file not found) — that's OK!
  // - If response is HTML  → server unreachable
  const body = new URLSearchParams({ wath: 'ivr2:_test_', convertType: 'json', token });

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
    if (text.trimStart().startsWith('<')) {
      return res.json({ ok: false, message: 'לא ניתן להגיע לשרת ימות המשיח' });
    }

    let json;
    try { json = JSON.parse(text); } catch {
      // Any non-HTML, non-JSON response means we reached the API — token OK
      return res.json({ ok: true });
    }

    if (json.responseStatus === 'OK') {
      return res.json({ ok: true });
    }

    // Check if it's an auth error or just a path error
    const msg = (json.message || json.responseStatus || '').toLowerCase();
    const isAuthError = msg.includes('token') || msg.includes('auth') ||
                        msg.includes('login') || msg.includes('unauthorized') ||
                        msg.includes('permission');

    if (isAuthError) {
      return res.json({ ok: false, message: `מפתח API לא תקין: ${json.message || json.responseStatus}` });
    }

    // Path/file error = token is valid, API is reachable
    return res.json({ ok: true });

  } catch (e) {
    return res.status(502).json({ ok: false, message: e.message });
  }
};
