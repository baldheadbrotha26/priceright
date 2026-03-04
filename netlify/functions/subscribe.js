// netlify/functions/subscribe.js
// This function runs on Netlify's servers — your API token stays SECRET here.
// The browser never sees it. It just calls this endpoint.

// Simple in-memory rate limiter
// Limits each IP to 3 signup attempts per 10 minutes
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return false;
  }

  // Reset window if expired
  if (now - entry.firstRequest > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return false;
  }

  // Within window — check count
  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count++;
  return false;
}

// Basic email validation
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

exports.handler = async function(event, context) {

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Get client IP for rate limiting
  const clientIP = event.headers['x-forwarded-for'] || 
                   event.headers['client-ip'] || 
                   'unknown';

  // Check rate limit
  if (isRateLimited(clientIP)) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Too many requests. Please try again in 10 minutes.' })
    };
  }

  // Parse the email from the request
  let email;
  try {
    const body = JSON.parse(event.body);
    email = body.email;
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body' })
    };
  }

  // Validate email format
  if (!email || !isValidEmail(email)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid email address' })
    };
  }

  // Limit email length to prevent abuse
  if (email.length > 254) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid email address' })
    };
  }

  // ── YOUR SENDFOX CONFIG ──
  // Stored as Netlify Environment Variables — NOT hardcoded here
  const SENDFOX_TOKEN = process.env.SENDFOX_TOKEN;
  const SENDFOX_LIST_ID = process.env.SENDFOX_LIST_ID;

  if (!SENDFOX_TOKEN || !SENDFOX_LIST_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const response = await fetch('https://api.sendfox.com/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SENDFOX_TOKEN}`
      },
      body: JSON.stringify({
        email: email,
        lists: [parseInt(SENDFOX_LIST_ID)]
      })
    });

    const data = await response.json();

    // 422 = already subscribed — still treat as success
    if (response.ok || response.status === 422) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Subscribed successfully' })
      };
    } else {
      console.error('SendFox error:', data);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: data.message || 'Subscription failed' })
      };
    }

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
