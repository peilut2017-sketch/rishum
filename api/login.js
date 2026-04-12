const fetch = require('node-fetch');

const DEFAULT_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password, apiKey, apiBase } = req.body;
  const base = (apiBase || DEFAULT_BASE).replace(/\/$/, '');

  try {
    let url;

    if (apiKey) {
      // Fixed API key → exchange for session token via Login
      // ימות המשיח accepts apiKey as a login parameter
      url = `${base}/Login?apiKey=${enc(apiKey)}`;
    } else {
      url = `${base}/Login?username=${enc(username)}&password=${enc(password)}`;
    }

    const r = await fetch(url);
    const json = await r.json();
    res.json(json);
  } catch (e) {
    res.status(502).json({ responseStatus: 'ERROR', message: e.message });
  }
};
