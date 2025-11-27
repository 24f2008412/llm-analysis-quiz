// server.js
const express = require('express');
const bodyParser = require('body-parser');
const solver = require('./solver');
const app = express();

// Use HF default port (7860) as fallback
const PORT = process.env.PORT || 7860;

app.use(bodyParser.json({ limit: '1mb' }));

// Health
app.get('/', (req, res) => res.send('LLM Analysis Quiz endpoint running'));

// Main webhook
app.post('/api/quiz-webhook', async (req, res) => {
  try {
    if (!req.is('application/json')) return res.status(400).json({ error: 'Invalid JSON' });
    const { email, secret, url } = req.body;
    if (!email || !secret || !url) return res.status(400).json({ error: 'Missing fields (email, secret, url required)' });

    // Verify secret
    const expected = process.env.SECRET;
    if (!expected) {
      console.error('SECRET not set in environment');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }
    if (secret !== expected) return res.status(403).json({ error: 'Invalid secret' });

    // Acknowledge quickly
    res.status(200).json({ status: 'accepted' });

    // Launch solver asynchronously (do NOT block the response)
    solver.solveAndSubmit({ email, secret, url }).catch(err => {
      console.error('Solver error (async):', err);
    });

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Invalid request' });
  }
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
