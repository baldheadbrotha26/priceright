// netlify/functions/subscribe.js
// This function runs on Netlify's servers — your API token stays SECRET here.
// The browser never sees it. It just calls this endpoint.

exports.handler = async function(event, context) {

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse the email from the request
  let email;
  try {
    const body = JSON.parse(event.body);
    email = body.email;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Basic email validation
  if (!email || !email.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email address' }) };
  }

  // ── YOUR SENDFOX CONFIG ──
  // These are stored as Netlify Environment Variables — NOT hardcoded here
  const SENDFOX_TOKEN = process.env.SENDFOX_TOKEN;
  const SENDFOX_LIST_ID = process.env.SENDFOX_LIST_ID;

  if (!SENDFOX_TOKEN || !SENDFOX_LIST_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
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
