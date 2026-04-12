const fs   = require('fs');
const path = require('path');

// Store in project's data/ dir (persistent on a real server)
// Falls back to /tmp on read-only environments (e.g. Vercel serverless)
function getConfigPath() {
  const dir = path.join(__dirname, '..', 'data');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Quick write-test
    const p = path.join(dir, 'config.json');
    fs.accessSync(dir, fs.constants.W_OK);
    return p;
  } catch {
    return path.join('/tmp', 'ym_global_config.json');
  }
}

function readConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return {};
}

function writeConfig(data) {
  const p = getConfigPath();
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    return res.json({ ok: true, config: readConfig() });
  }

  if (req.method === 'POST') {
    const { apiKey, extension, fileName } = req.body || {};
    const existing = readConfig();
    const updated  = { ...existing };
    if (apiKey    !== undefined) updated.apiKey    = apiKey;
    if (extension !== undefined) updated.extension = extension;
    if (fileName  !== undefined) updated.fileName  = fileName;
    writeConfig(updated);
    return res.json({ ok: true });
  }

  res.status(405).end();
};
