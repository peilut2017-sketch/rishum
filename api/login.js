const fetch = require('node-fetch');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password, apiBase } = req.body;
  const base = (apiBase || 'https://www.call2all.co.il/ym/api').replace(/\/$/, '');

  try {
    const r = await fetch(
      `${base}/Login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    );
    const json = await r.json();
    res.json(json);
  } catch (e) {
    res.status(502).json({ responseStatus: 'ERROR', message: e.message });
  }
};
