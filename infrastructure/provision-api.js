const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
app.use(express.json());

const SECRET = process.env.PROVISION_SECRET || 'iclaw-provision-2026';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'minimax/minimax-01';

let nextPort = 18001;

app.post('/provision', (req, res) => {
  const { phone, port, secret } = req.body;
  if (secret !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
  
  const userId = phone.replace('+', '');
  const userDir = '/opt/iclaw/users/' + userId;
  const assignedPort = port || nextPort++;
  const token = crypto.randomBytes(24).toString('hex');
  
  fs.mkdirSync(userDir + '/data', { recursive: true });
  fs.mkdirSync(userDir + '/workspace', { recursive: true });
  
  const config = {
    model: { provider: "openrouter", model: OPENROUTER_MODEL },
    agent: { systemPrompt: "You are a helpful AI assistant via iMessage. Keep responses concise. No markdown. Be friendly but brief." },
    gateway: { port: 18789, auth: { mode: "token", token: token }, http: { endpoints: { chatCompletions: { enabled: true } } } }
  };
  fs.writeFileSync(userDir + '/data/openclaw.json', JSON.stringify(config, null, 2));
  
  const dc = 'version: "3.8"\nservices:\n  openclaw:\n    image: node:22-slim\n    container_name: openclaw-' + userId + '\n    restart: unless-stopped\n    ports:\n      - "' + assignedPort + ':18789"\n    volumes:\n      - ' + userDir + '/data:/root/.openclaw\n      - ' + userDir + '/workspace:/workspace\n    environment:\n      - OPENROUTER_API_KEY=' + OPENROUTER_API_KEY + '\n      - OPENROUTER_MODEL=' + OPENROUTER_MODEL + '\n    command: sh -c "npm install -g openclaw@latest && openclaw gateway"';
  fs.writeFileSync(userDir + '/docker-compose.yml', dc);
  
  exec('cd ' + userDir + ' && docker-compose up -d', (err, stdout, stderr) => {
    if (err) console.error('Container error:', stderr);
    else console.log('Started ' + phone + ' on port ' + assignedPort);
  });
  
  console.log('Provisioned ' + phone + ' on port ' + assignedPort);
  res.json({ success: true, userId: userId, port: assignedPort, token: token });
});

app.post('/oauth', (req, res) => {
  const { phone, provider, tokens, secret } = req.body;
  if (secret !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
  
  const userId = phone.replace('+', '');
  const authDir = '/opt/iclaw/users/' + userId + '/data/agents/default/agent';
  fs.mkdirSync(authDir, { recursive: true });
  
  let authProfiles = {};
  const authPath = authDir + '/auth-profiles.json';
  if (fs.existsSync(authPath)) try { authProfiles = JSON.parse(fs.readFileSync(authPath)); } catch(e) {}
  
  authProfiles[provider] = { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at };
  fs.writeFileSync(authPath, JSON.stringify(authProfiles, null, 2));
  
  console.log('Saved ' + provider + ' tokens for ' + phone);
  res.json({ success: true });
});

app.listen(3456, () => console.log('Provision API on :3456'));
