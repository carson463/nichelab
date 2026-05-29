// netlify/functions/analyze.js
// Uses Node built-in https — works on Node 14, 16, 18+
// No npm packages required.
//
// DEPLOYMENT: Set ANTHROPIC_API_KEY in Netlify:
//   Site Settings → Environment Variables → Add variable

const https = require('https');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[NicheLab] ANTHROPIC_API_KEY environment variable is not set.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Service configuration error. Contact support.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request format.' }) };
  }

  const { prompt, systemPrompt, maxTokens } = payload;

  if (!prompt || typeof prompt !== 'string' || prompt.length < 1 || prompt.length > 10000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing prompt.' }) };
  }

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: Math.min(Number(maxTokens) || 2000, 4000),
    system: typeof systemPrompt === 'string' ? systemPrompt : '',
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errBody = {};
          try { errBody = JSON.parse(data); } catch {}
          console.error('[NicheLab] Anthropic error:', res.statusCode, JSON.stringify(errBody));

          const userMsg =
            res.statusCode === 429 ? 'Too many requests. Please wait a moment and try again.' :
            res.statusCode === 401 || res.statusCode === 403 ? 'The analysis service is not configured correctly. Contact support.' :
            'Analysis failed. Please try again.';

          resolve({ statusCode: res.statusCode, body: JSON.stringify({ error: userMsg }) });
        } else {
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: data
          });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[NicheLab] Request error:', err.message);
      resolve({ statusCode: 500, body: JSON.stringify({ error: 'Network error. Please try again.' }) });
    });

    req.write(requestBody);
    req.end();
  });
};
