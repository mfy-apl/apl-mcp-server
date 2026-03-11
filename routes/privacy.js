const express = require('express');
const router = express.Router();

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Airport Pickups London API</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fafafa;
      line-height: 1.8;
    }

    .container {
      max-width: 780px;
      margin: 0 auto;
      padding: 60px 30px 80px;
    }

    .back-link {
      display: inline-block;
      color: #d4a843;
      text-decoration: none;
      font-size: 14px;
      margin-bottom: 30px;
    }
    .back-link:hover { text-decoration: underline; }

    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .last-updated {
      color: #888;
      font-size: 14px;
      margin-bottom: 40px;
    }

    h2 {
      font-size: 20px;
      font-weight: 600;
      margin-top: 36px;
      margin-bottom: 12px;
      color: #d4a843;
    }

    p {
      color: #ccc;
      margin-bottom: 14px;
      font-size: 15px;
    }

    ul {
      padding-left: 24px;
      margin-bottom: 14px;
    }

    li {
      color: #ccc;
      font-size: 15px;
      margin-bottom: 6px;
    }

    a { color: #d4a843; }
    a:hover { text-decoration: underline; }

    code {
      font-family: 'Space Mono', monospace;
      background: #1a1a1a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }

    .footer {
      text-align: center;
      color: #888;
      font-size: 13px;
      padding: 30px 0;
      border-top: 1px solid #3a3a3a;
      margin-top: 60px;
    }
    .footer a { color: #d4a843; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <a href="/docs" class="back-link">&larr; Back to API Docs</a>

    <h1>Privacy Policy</h1>
    <p class="last-updated">Last updated: 5 March 2026</p>

    <h2>1. Who We Are</h2>
    <p>Airport Pickups London (APL Cars) is a licensed private hire operator based in London, UK. We operate the API and MCP services at <code>mcp.airport-pickups-london.com</code>.</p>
    <p>Contact: <a href="mailto:info@aplcars.com">info@aplcars.com</a> | +44 208 688 7744</p>

    <h2>2. What Data We Collect</h2>
    <p>When you use our API, MCP, or A2A services, we may collect:</p>
    <ul>
      <li><strong>Quote requests:</strong> Origin, destination, passenger count, dates/times. Quotes are not stored permanently.</li>
      <li><strong>Booking details:</strong> Passenger name, phone number, email address, flight number, pickup/dropoff addresses, and special requests. These are required to fulfil the transfer service.</li>
      <li><strong>Agent registration:</strong> Agent name, contact email, and optional website URL.</li>
      <li><strong>API keys:</strong> Generated and stored securely. Used for authentication only.</li>
      <li><strong>Server logs:</strong> IP addresses, request timestamps, and request paths for security and rate limiting. Logs are retained for up to 30 days.</li>
    </ul>

    <h2>3. How We Use Your Data</h2>
    <ul>
      <li>To process transfer quotes and bookings as requested</li>
      <li>To dispatch drivers and provide meet-and-greet services</li>
      <li>To send booking confirmations, driver tracking links, and manage-booking links via email</li>
      <li>To authenticate API requests and prevent abuse</li>
      <li>To comply with TfL (Transport for London) licensing requirements</li>
    </ul>

    <h2>4. Data Sharing</h2>
    <p>We share booking details with our dispatch partner to fulfil the transfer service. We do not sell personal data to third parties. Data may be shared with:</p>
    <ul>
      <li><strong>Dispatch system:</strong> Booking details are sent to our dispatch partner (London Tech) to assign a driver and track the journey.</li>
      <li><strong>Drivers:</strong> Passenger name, pickup location, and flight details are shared with the assigned driver.</li>
      <li><strong>Payment processors:</strong> If you pay online, your payment is processed by Stripe. We do not store card details.</li>
    </ul>

    <h2>5. Data Retention</h2>
    <ul>
      <li><strong>Booking data:</strong> Retained for 3 years as required by TfL licensing regulations.</li>
      <li><strong>Quote data:</strong> Temporary — not stored beyond the request lifecycle.</li>
      <li><strong>Server logs:</strong> Retained for up to 30 days, then automatically deleted.</li>
      <li><strong>Agent registrations:</strong> Retained while your account is active. Contact us to delete.</li>
    </ul>

    <h2>6. Security</h2>
    <p>All API traffic is encrypted via HTTPS/TLS. API keys are stored securely and can be rotated on request. Rate limiting and abuse detection are in place to protect the service.</p>

    <h2>7. AI and LLM Usage</h2>
    <p>Our services are designed to be used by AI assistants and language models (via MCP, A2A, and REST API). When an AI tool calls our API:</p>
    <ul>
      <li>We process the data in the same way as any API request</li>
      <li>We do not use your booking or personal data to train AI models</li>
      <li>Conversation history sent to our chat endpoint is processed in-memory and not stored</li>
    </ul>

    <h2>8. Your Rights</h2>
    <p>Under UK GDPR, you have the right to:</p>
    <ul>
      <li>Request a copy of your personal data</li>
      <li>Request correction of inaccurate data</li>
      <li>Request deletion of your data (subject to legal retention requirements)</li>
      <li>Withdraw consent at any time</li>
    </ul>
    <p>To exercise these rights, email <a href="mailto:info@aplcars.com">info@aplcars.com</a>.</p>

    <h2>9. Cookies</h2>
    <p>The API does not use cookies. The documentation pages (<code>/docs</code>) do not set tracking cookies.</p>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this policy from time to time. The "last updated" date at the top of this page indicates when the policy was last revised.</p>

    <div class="footer">
      &copy; 2026 Airport Pickups London &mdash; <a href="https://www.airport-pickups-london.com">www.airport-pickups-london.com</a> &mdash; <a href="/docs">API Docs</a>
    </div>
  </div>
</body>
</html>`;

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(HTML);
});

module.exports = router;
