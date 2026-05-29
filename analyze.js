// netlify/functions/analyze.js
// ============================================================
// SECURITY — NicheLab API Proxy
// ============================================================
// DEPLOYMENT STEPS:
//   1. Go to Netlify Dashboard → Site Settings → Environment Variables
//   2. Add: ANTHROPIC_API_KEY = your-new-api-key
//   3. ROTATE THE OLD KEY IMMEDIATELY at console.anthropic.com
//      The old key (sk-ant-api03-MEy4FJ...) was exposed in client
//      HTML and must be treated as fully compromised.
// ============================================================

exports.handler = async function (event) {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[NicheLab] ANTHROPIC_API_KEY is not set in environment variables.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Service configuration error. Contact support.' })
    };
  }

  // Parse request body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request format.' }) };
  }

  const { prompt, systemPrompt, maxTokens } = payload;

  // Validate prompt
  if (!prompt || typeof prompt !== 'string' || prompt.length < 1 || prompt.length > 10000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing prompt.' }) };
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,                   // API key stays server-side only
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: Math.min(Number(maxTokens) || 2000, 4000),
        system: typeof systemPrompt === 'string' ? systemPrompt : '',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({}));
      // Log full detail server-side, return sanitized message to client
      console.error('[NicheLab] Anthropic error:', upstream.status, JSON.stringify(errBody));

      const userMsg =
        upstream.status === 429 ? 'Too many requests. Please wait a moment and try again.' :
        upstream.status === 401 || upstream.status === 403 ? 'The analysis service is not configured correctly. Contact support.' :
        'Analysis failed. Please try again.';

      return { statusCode: upstream.status, body: JSON.stringify({ error: userMsg }) };
    }

    const data = await upstream.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

  } catch (err) {
    // Log full error server-side only
    console.error('[NicheLab] Proxy error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Network error. Please try again.' })
    };
  }
};
