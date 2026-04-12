const fetch = require('node-fetch');

const DEFAULT_BASE = 'https://www.call2all.co.il/ym/api';
const enc = encodeURIComponent;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // API key auth: token is used directly with dl.php — no Login call needed
  const { username, password, apiBase } = req.body;
  const base = (apiBase || DEFAULT_BASE).replace(/\/$/, '');

  try {
    const r = await fetch(`${base}/Login?username=${enc(username)}&password=${enc(password)}`);
    const json = await r.json();
    res.json(json);
  } catch (e) {
    res.status(502).json({ responseStatus: 'ERROR', message: e.message });
  }
};
