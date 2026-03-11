const express = require('express');
const router = express.Router();

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Airport Pickups London — API Documentation</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fafafa;
      line-height: 1.6;
    }

    .page-layout {
      display: flex;
      min-height: 100vh;
    }

    /* ── Left Sidebar ─────────────────────────────── */
    .sidebar {
      width: 240px;
      flex-shrink: 0;
      background: #1a1a1a;
      border-right: 1px solid #3a3a3a;
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      overflow-y: auto;
      z-index: 100;
    }

    .sidebar-header {
      padding: 24px 20px 20px;
      border-bottom: 1px solid #3a3a3a;
    }

    .sidebar-logo {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      margin-bottom: 12px;
    }

    .sidebar-header h1 {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      line-height: 1.3;
    }

    .sidebar-header p {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }

    .sidebar-nav {
      padding: 16px 12px;
    }

    .sidebar-nav a {
      display: block;
      color: #aaa;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 12px;
      border-radius: 6px;
      transition: all 0.15s;
      margin-bottom: 2px;
    }

    .sidebar-nav a:hover {
      background: rgba(212,168,67,0.08);
      color: #fafafa;
    }

    .sidebar-nav a.active {
      background: rgba(212,168,67,0.12);
      color: #d4a843;
    }

    .sidebar-nav .nav-divider {
      height: 1px;
      background: #3a3a3a;
      margin: 12px 0;
    }

    .sidebar-nav .nav-label {
      font-size: 10px;
      font-weight: 700;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 0 12px;
      margin-bottom: 6px;
      margin-top: 4px;
    }

    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
      vertical-align: middle;
    }

    .badge-green { background: rgba(52,211,153,0.15); color: #34d399; }
    .badge-blue { background: rgba(212,168,67,0.15); color: #d4a843; }

    /* ── Main Content ─────────────────────────────── */
    .main-content {
      margin-left: 240px;
      flex: 1;
      min-width: 0;
    }

    .container {
      max-width: 860px;
      margin: 0 auto;
      padding: 40px 40px 60px;
    }

    section {
      margin-bottom: 48px;
      scroll-margin-top: 20px;
    }

    h2 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid #3a3a3a;
    }

    h3 {
      font-size: 17px;
      font-weight: 600;
      margin: 24px 0 12px;
    }

    p, li {
      color: #aaa;
      font-size: 14px;
      margin-bottom: 10px;
    }

    ul { padding-left: 20px; margin-bottom: 16px; }
    li { margin-bottom: 6px; }

    .endpoint-card {
      background: #1a1a1a;
      border: 1px solid #3a3a3a;
      border-radius: 12px;
      margin-bottom: 24px;
      overflow: hidden;
    }

    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid #3a3a3a;
    }

    .method {
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      font-family: 'Space Mono', monospace;
    }

    .method-post { background: rgba(212,168,67,0.2); color: #d4a843; }

    .endpoint-path {
      font-family: 'Space Mono', monospace;
      font-size: 15px;
      font-weight: 600;
      color: #fafafa;
    }

    .endpoint-body { padding: 20px; }

    .param-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin: 12px 0 16px;
    }

    .param-table th {
      text-align: left;
      padding: 8px 12px;
      background: #0a0a0a;
      color: #888;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .param-table td {
      padding: 8px 12px;
      border-top: 1px solid #0a0a0a;
      color: #aaa;
    }

    .param-table tr:hover td { background: rgba(255,255,255,0.02); }

    .param-name {
      font-family: 'Space Mono', monospace;
      color: #fafafa;
      font-weight: 500;
    }

    .param-type {
      color: #a78bfa;
      font-size: 12px;
      font-family: 'Space Mono', monospace;
    }

    .required {
      color: #f87171;
      font-size: 11px;
      font-weight: 600;
    }

    .optional {
      color: #888;
      font-size: 11px;
    }

    pre {
      background: #1a1a1a;
      border: 1px solid #3a3a3a;
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
      font-family: 'Space Mono', monospace;
      font-size: 13px;
      line-height: 1.5;
      margin: 12px 0;
    }

    code {
      font-family: 'Space Mono', monospace;
      font-size: 13px;
    }

    .inline-code {
      background: #2a2a2a;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 13px;
    }

    .label {
      font-size: 12px;
      color: #888;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .note {
      background: rgba(212,168,67,0.08);
      border-left: 3px solid #d4a843;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      margin: 16px 0;
    }

    .warning {
      background: rgba(248,113,113,0.08);
      border-left: 3px solid #f87171;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      margin: 16px 0;
    }

    .error-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .error-table th {
      text-align: left;
      padding: 10px 12px;
      background: #1a1a1a;
      color: #888;
      font-weight: 600;
    }

    .error-table td {
      padding: 10px 12px;
      border-top: 1px solid #1a1a1a;
    }

    .status-code {
      font-family: 'Space Mono', monospace;
      font-weight: 600;
    }

    .footer {
      text-align: center;
      color: #888;
      font-size: 13px;
      padding: 30px 0;
      border-top: 1px solid #3a3a3a;
    }

    .footer a { color: #d4a843; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }

    .car-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin: 12px 0;
    }

    .car-table th {
      text-align: left;
      padding: 8px 12px;
      background: #1a1a1a;
      color: #888;
      font-weight: 600;
    }

    .car-table td {
      padding: 8px 12px;
      border-top: 1px solid #1a1a1a;
    }

    /* ── Mobile: sidebar becomes top bar ──────────── */
    @media (max-width: 860px) {
      .sidebar {
        position: fixed;
        width: 100%;
        height: auto;
        bottom: auto;
        border-right: none;
        border-bottom: 1px solid #3a3a3a;
      }

      .sidebar-header { display: none; }

      .sidebar-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 10px 12px;
        overflow-x: auto;
      }

      .sidebar-nav a {
        white-space: nowrap;
        padding: 6px 12px;
        font-size: 12px;
        margin-bottom: 0;
      }

      .sidebar-nav .nav-divider,
      .sidebar-nav .nav-label { display: none; }

      .main-content {
        margin-left: 0;
        margin-top: 52px;
      }

      .container {
        padding: 20px 15px 40px;
      }

      .endpoint-header { flex-wrap: wrap; }
      .param-table, .car-table, .error-table { font-size: 12px; }
    }
  </style>
</head>
<body>

<div class="page-layout">

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <img src="/public/apl-logo.jpg" alt="APL" class="sidebar-logo" />
      <h1>Airport Pickups London API</h1>
      <p>Booking API for Partners</p>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-label">Getting Started</div>
      <a href="#overview">Overview</a>
      <a href="#authentication">Authentication</a>
      <a href="#base-url">Base URL</a>
      <div class="nav-divider"></div>
      <div class="nav-label">REST API</div>
      <a href="#quote">Get Quote</a>
      <a href="#validate-flight">Validate Flight</a>
      <a href="#book">Create Booking</a>
      <a href="#cars">Car Types</a>
      <div class="nav-divider"></div>
      <div class="nav-label">MCP Protocol</div>
      <a href="#mcp-overview">Overview</a>
      <a href="#mcp-connect">Connect</a>
      <a href="#mcp-tools">Tools</a>
      <div class="nav-divider"></div>
      <div class="nav-label">A2A Protocol</div>
      <a href="#a2a-overview">Overview</a>
      <a href="#agent-discovery">Agent Discovery</a>
      <a href="#a2a-message-send">message/send</a>
      <a href="#a2a-tasks-get">tasks/get</a>
      <a href="#a2a-tasks-cancel">tasks/cancel</a>
      <a href="#a2a-errors">JSON-RPC Errors</a>
      <div class="nav-divider"></div>
      <div class="nav-label">Reference</div>
      <a href="#registration">Agent Registration</a>
      <a href="#errors">REST Errors</a>
      <a href="#flow">Integration Flow</a>
      <a href="#portal">Agency Portal</a>
      <a href="#support">Support</a>
    </nav>
  </aside>

  <!-- Main Content -->
  <main class="main-content">
    <div class="container">

  <!-- Overview -->
  <section id="overview">
    <h2>Overview</h2>
    <p>The Airport Pickups London (APL) API lets you get real-time transfer quotes and create bookings for airport, cruise port, and train station transfers across the UK.</p>
    <ul>
      <li>All UK airports including Heathrow (T2&ndash;T5), Gatwick (North &amp; South), Stansted, Luton, London City, Manchester, Birmingham, Edinburgh, and more</li>
      <li>Cruise ports: Southampton, Dover, Portsmouth, Tilbury, Harwich</li>
      <li>Transfers to/from any UK address or postcode</li>
      <li>Fixed prices &mdash; no surge pricing</li>
      <li>Free cancellation &amp; free child seats on request</li>
      <li>Meet &amp; greet included for airport pickups</li>
    </ul>
  </section>

  <!-- Authentication -->
  <section id="authentication">
    <h2>Authentication</h2>
    <p>All requests require an API key sent in the <code class="inline-code">x-api-key</code> header.</p>
    <pre><span style="color:#888">// Example header</span>
x-api-key: your-api-key-here</pre>
    <p>Your API key is linked to your account configuration (account ID, payment type, etc). If you are already a registered APL partner or agency, your API key has been assigned to you &mdash; contact us at <a href="mailto:info@airport-pickups-london.com" style="color:#d4a843;">info@airport-pickups-london.com</a> or call <strong>020 3988 2168</strong> to receive it. For new AI agents, you can <a href="#registration" style="color:#d4a843;">self-register</a> instantly.</p>
    <div class="warning">Keep your API key secure. Do not expose it in client-side code or public repositories. If compromised, contact us immediately for a replacement.</div>
  </section>

  <!-- Base URL -->
  <section id="base-url">
    <h2>Base URL</h2>
    <pre>https://mcp.airport-pickups-london.com/api</pre>
    <p>All endpoint paths below are relative to this base URL.</p>
  </section>

  <!-- Get Quote -->
  <section id="quote">
    <h2>Get Quote</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/api/quote</span>
      </div>
      <div class="endpoint-body">
        <p>Get available car types and prices for a transfer. Use this to show pricing to your customers before they book.</p>

        <h3>Request Body</h3>
        <table class="param-table">
          <thead>
            <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="param-name">origin</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="required">required</span></td>
              <td>Pickup location &mdash; airport name, full address, or postcode (e.g. "Heathrow Terminal 5", "SW1A 2AA")</td>
            </tr>
            <tr>
              <td><span class="param-name">destination</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="required">required</span></td>
              <td>Dropoff location &mdash; full address, postcode, or airport name</td>
            </tr>
            <tr>
              <td><span class="param-name">passengers</span></td>
              <td><span class="param-type">number</span></td>
              <td><span class="optional">optional</span></td>
              <td>Number of passengers (default: 1). Used to recommend the right car.</td>
            </tr>
            <tr>
              <td><span class="param-name">suitcases</span></td>
              <td><span class="param-type">number</span></td>
              <td><span class="optional">optional</span></td>
              <td>Number of suitcases / large bags (default: 0)</td>
            </tr>
            <tr>
              <td><span class="param-name">transfer_date</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">optional</span></td>
              <td>Date in YYYY-MM-DD format (e.g. "2026-03-15"). Defaults to today.</td>
            </tr>
            <tr>
              <td><span class="param-name">transfer_time</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">optional</span></td>
              <td>Time in HH:MM format (e.g. "14:30"). Defaults to 2 hours from now.</td>
            </tr>
            <tr>
              <td><span class="param-name">requestedDiscountPercent</span></td>
              <td><span class="param-type">number</span></td>
              <td><span class="optional">optional</span></td>
              <td>A2A pricing negotiation: request a discount (0&ndash;5%). Values above 5 are capped at 5%. Non-negotiable: peak surcharges, event pricing, child seats. Response includes <code class="inline-code">appliedDiscountPercent</code> showing the actual discount given.</td>
            </tr>
          </tbody>
        </table>

        <div class="label">Example Request</div>
        <pre><span style="color:#d4a843">curl</span> -X POST https://mcp.airport-pickups-london.com/api/quote \\
  -H <span style="color:#34d399">"Content-Type: application/json"</span> \\
  -H <span style="color:#34d399">"x-api-key: your-api-key"</span> \\
  -d <span style="color:#fbbf24">'{
    "origin": "Heathrow Terminal 5",
    "destination": "10 Downing Street, London, SW1A 2AA",
    "passengers": 2,
    "suitcases": 2,
    "transfer_date": "2026-03-15",
    "transfer_time": "14:30"
  }'</span></pre>

        <div class="label">Example Request (with discount negotiation)</div>
        <pre><span style="color:#d4a843">curl</span> -X POST https://mcp.airport-pickups-london.com/api/quote \\
  -H <span style="color:#34d399">"Content-Type: application/json"</span> \\
  -H <span style="color:#34d399">"x-api-key: your-api-key"</span> \\
  -d <span style="color:#fbbf24">'{
    "origin": "Heathrow",
    "destination": "W1",
    "requestedDiscountPercent": 3
  }'</span></pre>

        <div class="label">Example Response</div>
        <pre>{
  <span style="color:#34d399">"pickup"</span>: <span style="color:#fbbf24">"London Heathrow Airport, Terminal 5"</span>,
  <span style="color:#34d399">"dropoff"</span>: <span style="color:#fbbf24">"10 Downing Street, Downing Street, London SW1A 2AA, UK"</span>,
  <span style="color:#34d399">"transfer_date"</span>: <span style="color:#fbbf24">"2026-03-15"</span>,
  <span style="color:#34d399">"transfer_time"</span>: <span style="color:#fbbf24">"14:30"</span>,
  <span style="color:#34d399">"passengers"</span>: <span style="color:#a78bfa">2</span>,
  <span style="color:#34d399">"recommended_car_type"</span>: <span style="color:#fbbf24">"Saloon"</span>,
  <span style="color:#34d399">"duration"</span>: <span style="color:#fbbf24">"51 minutes"</span>,
  <span style="color:#34d399">"cars"</span>: [
    {
      <span style="color:#34d399">"car_type"</span>: <span style="color:#fbbf24">"Saloon"</span>,
      <span style="color:#34d399">"price_gbp"</span>: <span style="color:#a78bfa">88</span>,
      <span style="color:#34d399">"max_passengers"</span>: <span style="color:#a78bfa">3</span>,
      <span style="color:#34d399">"max_bags"</span>: <span style="color:#a78bfa">3</span>
    },
    {
      <span style="color:#34d399">"car_type"</span>: <span style="color:#fbbf24">"People Carrier"</span>,
      <span style="color:#34d399">"price_gbp"</span>: <span style="color:#a78bfa">98</span>,
      <span style="color:#34d399">"max_passengers"</span>: <span style="color:#a78bfa">5</span>,
      <span style="color:#34d399">"max_bags"</span>: <span style="color:#a78bfa">5</span>
    },
    {
      <span style="color:#34d399">"car_type"</span>: <span style="color:#fbbf24">"8 Seater"</span>,
      <span style="color:#34d399">"price_gbp"</span>: <span style="color:#a78bfa">119</span>,
      <span style="color:#34d399">"max_passengers"</span>: <span style="color:#a78bfa">8</span>,
      <span style="color:#34d399">"max_bags"</span>: <span style="color:#a78bfa">8</span>
    }
  ],
  <span style="color:#34d399">"meeting_point"</span>: {
    <span style="color:#34d399">"name"</span>: <span style="color:#fbbf24">"Heathrow T5"</span>,
    <span style="color:#34d399">"instructions"</span>: <span style="color:#fbbf24">"Our driver will hold a board with your name inside the terminal..."</span>
  }
}</pre>
      </div>
    </div>
  </section>

  <!-- Validate Flight -->
  <section id="validate-flight">
    <h2>Validate Flight</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <code class="endpoint-url">/api/validate-flight</code>
      </div>
      <p>Validate a flight number and get flight details including airline name, arrival airport, terminal, and arrival time. Use this before booking to verify the customer&rsquo;s flight and auto-detect the correct terminal. Works with flights within the next few days (FlightStats live data) and has static terminal mapping as fallback for future dates.</p>

      <h3>Request Body</h3>
      <div class="param-table">
        <table>
          <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code class="inline-code">flight_number</code></td><td>string</td><td>Yes</td><td>Flight number (e.g. &ldquo;BA2534&rdquo;, &ldquo;EK007&rdquo;, &ldquo;AA38&rdquo;)</td></tr>
            <tr><td><code class="inline-code">date</code></td><td>string</td><td>Yes</td><td>Flight date in YYYY-MM-DD format</td></tr>
          </tbody>
        </table>
      </div>

      <div class="label">Response Example</div>
      <div class="response-block">
<pre>{
  <span style="color:#34d399">"valid"</span>: <span style="color:#a78bfa">true</span>,
  <span style="color:#34d399">"airline"</span>: <span style="color:#fbbf24">"British Airways"</span>,
  <span style="color:#34d399">"flight_number"</span>: <span style="color:#fbbf24">"BA2534"</span>,
  <span style="color:#34d399">"arrival_airport"</span>: <span style="color:#fbbf24">"Heathrow"</span>,
  <span style="color:#34d399">"arrival_terminal"</span>: <span style="color:#fbbf24">"T5"</span>,
  <span style="color:#34d399">"arrival_time"</span>: <span style="color:#fbbf24">"14:30"</span>,
  <span style="color:#34d399">"departure_airport"</span>: <span style="color:#fbbf24">"DXB"</span>,
  <span style="color:#34d399">"source"</span>: <span style="color:#fbbf24">"flightstats"</span>
}</pre>
      </div>
      <p>If the flight cannot be verified, returns <code class="inline-code">{ "valid": false, "message": "..." }</code>. This never blocks booking &mdash; the customer can still proceed without flight validation.</p>
      <div class="note"><strong>Tip:</strong> For airport pickups, call this before booking to show the customer their flight details and auto-detected terminal. The <code class="inline-code">POST /api/book</code> endpoint also validates the flight automatically, so this call is optional but improves UX.</div>
    </div>
  </section>

  <!-- Create Booking -->
  <section id="book">
    <h2>Create Booking</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/api/book</span>
      </div>
      <div class="endpoint-body">
        <p>Create a confirmed transfer booking. This creates a real reservation &mdash; only call after your customer confirms.</p>

        <div class="warning">This endpoint creates <strong>live bookings</strong>. Always get a quote first and confirm with your customer before calling this endpoint.</div>

        <h3>Request Body</h3>
        <table class="param-table">
          <thead>
            <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="param-name">origin</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="required">required</span></td>
              <td>Pickup location</td>
            </tr>
            <tr>
              <td><span class="param-name">destination</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="required">required</span></td>
              <td>Dropoff location</td>
            </tr>
            <tr>
              <td><span class="param-name">transfer_date</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="required">required</span></td>
              <td>Date in YYYY-MM-DD format</td>
            </tr>
            <tr>
              <td><span class="param-name">transfer_time</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="required">required</span></td>
              <td>Time in HH:MM format</td>
            </tr>
            <tr>
              <td><span class="param-name">passenger_name</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="required">required</span></td>
              <td>Full name of the lead passenger</td>
            </tr>
            <tr>
              <td><span class="param-name">passenger_phone</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="required">required</span></td>
              <td>Phone number with country code (e.g. "+447123456789")</td>
            </tr>
            <tr>
              <td><span class="param-name">passenger_email</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">recommended</span></td>
              <td>Email for booking confirmation and manage-booking link</td>
            </tr>
            <tr>
              <td><span class="param-name">passengers</span></td>
              <td><span class="param-type">number</span></td>
              <td><span class="optional">optional</span></td>
              <td>Number of passengers (default: 1)</td>
            </tr>
            <tr>
              <td><span class="param-name">suitcases</span></td>
              <td><span class="param-type">number</span></td>
              <td><span class="optional">optional</span></td>
              <td>Number of suitcases (default: 1)</td>
            </tr>
            <tr>
              <td><span class="param-name">car_type</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">optional</span></td>
              <td>Car type from the quote (e.g. "Saloon", "People Carrier"). Auto-selected if omitted.</td>
            </tr>
            <tr>
              <td><span class="param-name">door_number</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">conditional</span></td>
              <td>House/building number. <strong>Required when destination is a postcode</strong> (e.g. "12", "Flat 3").</td>
            </tr>
            <tr>
              <td><span class="param-name">flight_number</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">conditional</span></td>
              <td>Flight number &mdash; required for airport pickups, optional for dropoffs (e.g. "BA2534"). Auto-validates and detects terminal.</td>
            </tr>
            <tr>
              <td><span class="param-name">cruise_name</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">conditional</span></td>
              <td>Ship/cruise name for port transfers (e.g. "P&amp;O Ventura")</td>
            </tr>
            <tr>
              <td><span class="param-name">train_number</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">conditional</span></td>
              <td>Train number or origin for station transfers</td>
            </tr>
            <tr>
              <td><span class="param-name">special_requests</span></td>
              <td><span class="param-type">string</span></td>
              <td><span class="optional">optional</span></td>
              <td>Any special requirements (e.g. "child seat needed", "wheelchair access")</td>
            </tr>
          </tbody>
        </table>

        <div class="note">
          <strong>Conditional fields:</strong> Include <code class="inline-code">flight_number</code> for airport pickups (required) or dropoffs (optional), <code class="inline-code">cruise_name</code> for port transfers, <code class="inline-code">door_number</code> when destination is a postcode.
        </div>

        <div class="label">Example Request</div>
        <pre><span style="color:#d4a843">curl</span> -X POST https://mcp.airport-pickups-london.com/api/book \\
  -H <span style="color:#34d399">"Content-Type: application/json"</span> \\
  -H <span style="color:#34d399">"x-api-key: your-api-key"</span> \\
  -d <span style="color:#fbbf24">'{
    "origin": "Heathrow Terminal 5",
    "destination": "10 Downing Street, London, SW1A 2AA",
    "transfer_date": "2026-03-15",
    "transfer_time": "14:30",
    "passengers": 2,
    "suitcases": 2,
    "car_type": "Saloon",
    "passenger_name": "John Smith",
    "passenger_phone": "+447123456789",
    "passenger_email": "john@example.com",
    "door_number": "10",
    "flight_number": "BA2534",
    "special_requests": "Child seat needed"
  }'</span></pre>

        <div class="label">Example Response</div>
        <pre>{
  <span style="color:#34d399">"booking_ref"</span>: <span style="color:#fbbf24">"APL-X7K9M2"</span>,
  <span style="color:#34d399">"external_ref"</span>: <span style="color:#a78bfa">954226</span>,
  <span style="color:#34d399">"status"</span>: <span style="color:#fbbf24">"confirmed"</span>,
  <span style="color:#34d399">"pickup"</span>: <span style="color:#fbbf24">"London Heathrow Airport, Terminal 5"</span>,
  <span style="color:#34d399">"dropoff"</span>: <span style="color:#fbbf24">"10 Downing Street, Downing Street, London SW1A 2AA, UK"</span>,
  <span style="color:#34d399">"date"</span>: <span style="color:#fbbf24">"2026-03-15"</span>,
  <span style="color:#34d399">"time"</span>: <span style="color:#fbbf24">"14:30"</span>,
  <span style="color:#34d399">"car_type"</span>: <span style="color:#fbbf24">"Saloon"</span>,
  <span style="color:#34d399">"price_gbp"</span>: <span style="color:#a78bfa">88</span>,
  <span style="color:#34d399">"passengers"</span>: <span style="color:#a78bfa">2</span>,
  <span style="color:#34d399">"passenger"</span>: {
    <span style="color:#34d399">"name"</span>: <span style="color:#fbbf24">"John Smith"</span>,
    <span style="color:#34d399">"phone"</span>: <span style="color:#fbbf24">"+447123456789"</span>,
    <span style="color:#34d399">"email"</span>: <span style="color:#fbbf24">"john@example.com"</span>
  },
  <span style="color:#34d399">"duration"</span>: <span style="color:#fbbf24">"51 minutes"</span>,
  <span style="color:#34d399">"manage_booking_url"</span>: <span style="color:#fbbf24">"https://www.airport-pickups-london.com/manage-booking.html?reservationId=954226&email=john%40example.com"</span>,
  <span style="color:#34d399">"meeting_point"</span>: {
    <span style="color:#34d399">"name"</span>: <span style="color:#fbbf24">"Heathrow T5"</span>,
    <span style="color:#34d399">"instructions"</span>: <span style="color:#fbbf24">"Our driver will hold a board with your name inside the terminal..."</span>
  },
  <span style="color:#34d399">"flight_info"</span>: {
    <span style="color:#34d399">"airline"</span>: <span style="color:#fbbf24">"British Airways"</span>,
    <span style="color:#34d399">"flight_number"</span>: <span style="color:#fbbf24">"BA2534"</span>,
    <span style="color:#34d399">"arrival_airport"</span>: <span style="color:#fbbf24">"Heathrow"</span>,
    <span style="color:#34d399">"arrival_terminal"</span>: <span style="color:#fbbf24">"T5"</span>,
    <span style="color:#34d399">"arrival_time"</span>: <span style="color:#fbbf24">"14:30"</span>,
    <span style="color:#34d399">"departure_airport"</span>: <span style="color:#fbbf24">"DXB"</span>
  },
  <span style="color:#34d399">"message"</span>: <span style="color:#fbbf24">"Booking confirmed! You can pay the driver in cash on the day, or if you prefer to pay by card, Apple Pay, or Google Pay, use the manage booking link."</span>
}</pre>

        <h3>Response Fields</h3>
        <table class="param-table">
          <thead>
            <tr><th>Field</th><th>Type</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><span class="param-name">booking_ref</span></td><td><span class="param-type">string</span></td><td>APL internal booking reference (e.g. "APL-X7K9M2")</td></tr>
            <tr><td><span class="param-name">external_ref</span></td><td><span class="param-type">number</span></td><td>Reservation ID in the dispatch system</td></tr>
            <tr><td><span class="param-name">status</span></td><td><span class="param-type">string</span></td><td>Booking status &mdash; "confirmed" on success</td></tr>
            <tr><td><span class="param-name">price_gbp</span></td><td><span class="param-type">number</span></td><td>Final price in GBP</td></tr>
            <tr><td><span class="param-name">manage_booking_url</span></td><td><span class="param-type">string</span></td><td>Link to manage, track, pay by card/Apple Pay/Google Pay, and edit the booking</td></tr>
            <tr><td><span class="param-name">meeting_point</span></td><td><span class="param-type">object</span></td><td>Driver meeting instructions (for airport/station pickups)</td></tr>
            <tr><td><span class="param-name">flight_info</span></td><td><span class="param-type">object|null</span></td><td>Flight details from FlightStats validation (if flight_number was provided and verified). Contains: <code class="inline-code">airline</code>, <code class="inline-code">flight_number</code>, <code class="inline-code">arrival_airport</code>, <code class="inline-code">arrival_terminal</code>, <code class="inline-code">arrival_time</code>, <code class="inline-code">departure_airport</code></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- Car Types -->
  <section id="cars">
    <h2>Car Types</h2>
    <p>Available vehicle types returned in quote responses. Use the <code class="inline-code">car_type</code> value when creating a booking.</p>
    <table class="car-table">
      <thead>
        <tr><th>Car Type</th><th>Max Passengers</th><th>Max Bags</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr><td><strong>Saloon</strong></td><td>3</td><td>3</td><td>Standard sedan &mdash; ideal for 1&ndash;3 passengers</td></tr>
        <tr><td><strong>People Carrier</strong></td><td>5</td><td>5</td><td>Spacious MPV for families or groups</td></tr>
        <tr><td><strong>8 Seater</strong></td><td>8</td><td>8</td><td>Minibus for larger groups</td></tr>
        <tr><td><strong>Executive Saloon</strong></td><td>3</td><td>3</td><td>Premium sedan with luxury interior</td></tr>
        <tr><td><strong>Executive MPV</strong></td><td>7</td><td>7</td><td>Premium people carrier</td></tr>
        <tr><td><strong>Executive 8 Seater</strong></td><td>8</td><td>8</td><td>Premium minibus with luxury interior</td></tr>
      </tbody>
    </table>
    <div class="note">Additional vehicle types (Estate, Mercedes S Class, 16/20/40 Seaters) may be available on certain routes.</div>
  </section>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!-- MCP PROTOCOL DOCUMENTATION                            -->
  <!-- ═══════════════════════════════════════════════════════ -->

  <section id="mcp-overview">
    <h2>MCP Protocol <span class="badge badge-green">Model Context Protocol</span></h2>
    <p>Our server implements the <strong>Model Context Protocol (MCP)</strong> &mdash; the open standard used by Claude, Cursor, Windsurf, and other AI tools for connecting to external services. MCP provides tool-based access to quoting and booking via Streamable HTTP transport with OAuth 2.1 authentication.</p>

    <div class="note">
      <strong>When to use MCP vs REST API:</strong> Use MCP when your AI assistant or IDE natively supports it (Claude, Cursor, Windsurf, Claude Code). Use the REST API for direct programmatic integration from your own code.
    </div>

    <h3>Endpoint</h3>
    <div class="code-block"><div class="code-header"><span>MCP Server URL</span></div><pre>https://mcp.airport-pickups-london.com/mcp</pre></div>

    <h3>Authentication</h3>
    <p>The MCP server supports two authentication methods:</p>
    <ul style="padding-left: 20px; margin-top: 10px;">
      <li style="margin-bottom: 8px;"><strong>API Key</strong> &mdash; Send your key in the <code class="inline-code">x-api-key</code> header (same key as the REST API)</li>
      <li style="margin-bottom: 8px;"><strong>OAuth 2.1</strong> &mdash; Automatic for Claude.ai Integrations and other OAuth-capable clients. Supports authorization code (with PKCE) and client credentials grants.</li>
    </ul>
  </section>

  <section id="mcp-connect">
    <h2>Connect to MCP</h2>

    <h3>Claude.ai (Recommended)</h3>
    <p>The easiest way &mdash; no setup required:</p>
    <ol style="padding-left: 20px;">
      <li style="margin-bottom: 8px;">Go to <strong>Settings &rarr; Integrations &rarr; Add Custom Integration</strong></li>
      <li style="margin-bottom: 8px;">Enter: <code class="inline-code">https://mcp.airport-pickups-london.com/mcp</code></li>
      <li style="margin-bottom: 8px;">Ask Claude: &ldquo;How much is a taxi from Heathrow to Oxford?&rdquo;</li>
    </ol>

    <h3>Claude Desktop</h3>
    <p>Add to your <code class="inline-code">claude_desktop_config.json</code>:</p>
    <div class="code-block"><div class="code-header"><span>Claude Desktop Config</span></div><pre>{
  "mcpServers": {
    "airport-pickups-london": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.airport-pickups-london.com/mcp",
        "--header",
        "x-api-key:YOUR_API_KEY"
      ]
    }
  }
}</pre></div>

    <h3>Claude Code (CLI)</h3>
    <div class="code-block"><div class="code-header"><span>Terminal</span></div><pre>claude mcp add apl-transfers https://mcp.airport-pickups-london.com/mcp --header "x-api-key:YOUR_API_KEY"</pre></div>

    <h3>Cursor / Windsurf / Other IDEs</h3>
    <p>Add the MCP server URL in your IDE&rsquo;s MCP settings. Most IDEs support remote MCP servers via Streamable HTTP transport.</p>
  </section>

  <section id="mcp-tools">
    <h2>MCP Tools</h2>
    <p>Three tools are available via the MCP server:</p>

    <h3><code class="inline-code">london_airport_transfer_quote</code></h3>
    <p>Get fixed-price quotes for airport and cruise port transfers. Returns all available car types with prices, capacity, and luggage info.</p>
    <div class="param-table">
      <table>
        <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code class="inline-code">origin</code></td><td>string</td><td>Yes</td><td>Pickup location &mdash; airport name or address/postcode</td></tr>
          <tr><td><code class="inline-code">destination</code></td><td>string</td><td>Yes</td><td>Dropoff location &mdash; address, postcode, or airport</td></tr>
          <tr><td><code class="inline-code">passengers</code></td><td>number</td><td>No</td><td>Number of passengers (default 1)</td></tr>
          <tr><td><code class="inline-code">suitcases</code></td><td>number</td><td>No</td><td>Number of suitcases (default 1)</td></tr>
          <tr><td><code class="inline-code">transfer_date</code></td><td>string</td><td>No</td><td>Date in YYYY-MM-DD format</td></tr>
          <tr><td><code class="inline-code">transfer_time</code></td><td>string</td><td>No</td><td>Time in HH:MM format</td></tr>
        </tbody>
      </table>
    </div>

    <h3><code class="inline-code">book_london_airport_transfer</code></h3>
    <p>Create a confirmed reservation. Requires passenger details, date/time, and locations. Returns a booking reference and management link for payment and live driver tracking.</p>
    <div class="param-table">
      <table>
        <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code class="inline-code">origin</code></td><td>string</td><td>Yes</td><td>Pickup location</td></tr>
          <tr><td><code class="inline-code">destination</code></td><td>string</td><td>Yes</td><td>Dropoff location</td></tr>
          <tr><td><code class="inline-code">transfer_date</code></td><td>string</td><td>Yes</td><td>Date (YYYY-MM-DD)</td></tr>
          <tr><td><code class="inline-code">transfer_time</code></td><td>string</td><td>Yes</td><td>Time (HH:MM)</td></tr>
          <tr><td><code class="inline-code">passenger_name</code></td><td>string</td><td>Yes</td><td>Full name</td></tr>
          <tr><td><code class="inline-code">passenger_phone</code></td><td>string</td><td>Yes</td><td>Phone with country code</td></tr>
          <tr><td><code class="inline-code">passenger_email</code></td><td>string</td><td>No</td><td>Email for confirmation</td></tr>
          <tr><td><code class="inline-code">passengers</code></td><td>number</td><td>No</td><td>Number of passengers (default 1)</td></tr>
          <tr><td><code class="inline-code">car_type</code></td><td>string</td><td>No</td><td>e.g. &ldquo;Saloon&rdquo;, &ldquo;People Carrier&rdquo;</td></tr>
          <tr><td><code class="inline-code">flight_number</code></td><td>string</td><td>No</td><td>Flight number for airport pickups</td></tr>
          <tr><td><code class="inline-code">special_requests</code></td><td>string</td><td>No</td><td>e.g. &ldquo;child seat needed&rdquo;</td></tr>
        </tbody>
      </table>
    </div>

    <h3><code class="inline-code">validate_flight</code></h3>
    <p>Validate a flight number and get flight details including airline name, arrival airport, terminal, and arrival time. Use this before booking to verify the customer&rsquo;s flight and auto-detect the correct terminal.</p>
    <div class="param-table">
      <table>
        <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code class="inline-code">flight_number</code></td><td>string</td><td>Yes</td><td>Flight number (e.g. &ldquo;BA2534&rdquo;, &ldquo;EK007&rdquo;)</td></tr>
          <tr><td><code class="inline-code">date</code></td><td>string</td><td>Yes</td><td>Flight date in YYYY-MM-DD format</td></tr>
        </tbody>
      </table>
    </div>
    <div class="label">Response</div>
    <pre>{
  <span style="color:#34d399">"valid"</span>: <span style="color:#a78bfa">true</span>,
  <span style="color:#34d399">"airline"</span>: <span style="color:#fbbf24">"British Airways"</span>,
  <span style="color:#34d399">"flight_number"</span>: <span style="color:#fbbf24">"BA2534"</span>,
  <span style="color:#34d399">"arrival_airport"</span>: <span style="color:#fbbf24">"Heathrow"</span>,
  <span style="color:#34d399">"arrival_terminal"</span>: <span style="color:#fbbf24">"T5"</span>,
  <span style="color:#34d399">"arrival_time"</span>: <span style="color:#fbbf24">"14:30"</span>,
  <span style="color:#34d399">"departure_airport"</span>: <span style="color:#fbbf24">"DXB"</span>
}</pre>
    <p>If the flight is not found or invalid, returns <code class="inline-code">{ "valid": false, "message": "..." }</code>. Booking can still proceed without flight validation.</p>
  </section>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!-- A2A PROTOCOL DOCUMENTATION                           -->
  <!-- ═══════════════════════════════════════════════════════ -->

  <!-- A2A Overview -->
  <section id="a2a-overview">
    <h2>A2A Protocol <span class="badge badge-blue">Agent-to-Agent</span></h2>
    <p>The APL Transfer Agent implements Google's <strong>Agent-to-Agent (A2A) protocol</strong>, allowing any A2A-compatible AI agent to discover our services and request quotes or bookings via standard JSON-RPC 2.0 messages.</p>

    <div class="note">
      <strong>When to use A2A vs REST API:</strong> Use the REST API (<code class="inline-code">/api/quote</code>, <code class="inline-code">/api/book</code>) for direct programmatic integration. Use A2A (<code class="inline-code">/a2a</code>) when your AI agent needs to discover and communicate with APL using the standard A2A protocol.
    </div>

    <h3>How It Works</h3>
    <ol style="padding-left: 20px;">
      <li style="margin-bottom: 10px;"><strong>Discovery</strong> &mdash; Your agent fetches <code class="inline-code">/.well-known/agent.json</code> to learn what APL can do</li>
      <li style="margin-bottom: 10px;"><strong>Authentication</strong> &mdash; Include your API key in the <code class="inline-code">x-api-key</code> header (same key as the REST API)</li>
      <li style="margin-bottom: 10px;"><strong>Send a message</strong> &mdash; POST a JSON-RPC 2.0 request to <code class="inline-code">/a2a</code> with a <code class="inline-code">message/send</code> method</li>
      <li style="margin-bottom: 10px;"><strong>Get results</strong> &mdash; The response contains a task with status and artifacts (quote data or booking confirmation)</li>
    </ol>

    <h3>Base URL</h3>
    <pre>https://mcp.airport-pickups-london.com</pre>

    <h3>Available Skills</h3>
    <table class="param-table">
      <thead>
        <tr><th>Skill ID</th><th>Name</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="param-name">get_quote</span></td>
          <td>Transfer Quoting</td>
          <td>Get fixed prices for all car types on any supported route</td>
        </tr>
        <tr>
          <td><span class="param-name">create_booking</span></td>
          <td>Transfer Booking</td>
          <td>Create a live reservation with passenger details</td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- Agent Discovery -->
  <section id="agent-discovery">
    <h2>Agent Discovery</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method" style="background:rgba(16,185,129,0.2);color:#34d399;">GET</span>
        <span class="endpoint-path">/.well-known/agent.json</span>
        <span class="badge badge-green">Public</span>
      </div>
      <div class="endpoint-body">
        <p>Returns the Agent Card describing APL's capabilities, skills, and authentication requirements. No API key required.</p>

        <div class="label">Example Request</div>
        <pre><span style="color:#d4a843">curl</span> https://mcp.airport-pickups-london.com/.well-known/agent.json</pre>

        <div class="label">Response</div>
        <p>Returns a JSON Agent Card with:</p>
        <ul>
          <li><code class="inline-code">name</code> &mdash; Agent identifier (<code class="inline-code">airport-pickups-london</code>)</li>
          <li><code class="inline-code">supported_interfaces</code> &mdash; A2A endpoint URL and protocol version</li>
          <li><code class="inline-code">skills</code> &mdash; Available skills with descriptions, tags, and examples</li>
          <li><code class="inline-code">security_schemes</code> &mdash; How to authenticate (API key in <code class="inline-code">x-api-key</code> header)</li>
          <li><code class="inline-code">capabilities</code> &mdash; Supported features (streaming, push notifications)</li>
        </ul>
      </div>
    </div>
  </section>

  <!-- message/send -->
  <section id="a2a-message-send">
    <h2>message/send</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/a2a</span>
      </div>
      <div class="endpoint-body">
        <p>Send a message to the APL agent. The agent processes the message, executes the appropriate skill, and returns a task with the result.</p>

        <h3>Task States</h3>
        <table class="param-table">
          <thead>
            <tr><th>State</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td><span class="param-name">completed</span></td><td>Skill executed successfully &mdash; check <code class="inline-code">artifacts</code> for results</td></tr>
            <tr><td><span class="param-name">failed</span></td><td>Skill execution failed &mdash; check <code class="inline-code">status.message</code> for error details</td></tr>
            <tr><td><span class="param-name">input-required</span></td><td>Agent needs more information &mdash; check <code class="inline-code">status.message</code> for guidance</td></tr>
          </tbody>
        </table>

        <h3>Option 1: DataPart (Recommended)</h3>
        <p>Send structured JSON data with a <code class="inline-code">skill</code> field for explicit routing, or omit it for auto-detection.</p>

        <div class="label">Get a Quote</div>
        <pre><span style="color:#d4a843">curl</span> -X POST https://mcp.airport-pickups-london.com/a2a \\
  -H <span style="color:#34d399">"Content-Type: application/json"</span> \\
  -H <span style="color:#34d399">"x-api-key: your-api-key"</span> \\
  -d <span style="color:#fbbf24">'{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{
          "type": "data",
          "mimeType": "application/json",
          "data": {
            "skill": "get_quote",
            "origin": "Heathrow",
            "destination": "W1K 1LN",
            "passengers": 2,
            "transfer_date": "2026-04-01",
            "transfer_time": "14:00"
          }
        }]
      }
    }
  }'</span></pre>

        <div class="label">Quote Response (completed task with artifact)</div>
        <pre>{
  <span style="color:#34d399">"jsonrpc"</span>: <span style="color:#fbbf24">"2.0"</span>,
  <span style="color:#34d399">"id"</span>: <span style="color:#a78bfa">1</span>,
  <span style="color:#34d399">"result"</span>: {
    <span style="color:#34d399">"id"</span>: <span style="color:#fbbf24">"a1b2c3d4-..."</span>,
    <span style="color:#34d399">"status"</span>: { <span style="color:#34d399">"state"</span>: <span style="color:#fbbf24">"completed"</span> },
    <span style="color:#34d399">"artifacts"</span>: [{
      <span style="color:#34d399">"name"</span>: <span style="color:#fbbf24">"quote"</span>,
      <span style="color:#34d399">"parts"</span>: [{
        <span style="color:#34d399">"type"</span>: <span style="color:#fbbf24">"data"</span>,
        <span style="color:#34d399">"mimeType"</span>: <span style="color:#fbbf24">"application/json"</span>,
        <span style="color:#34d399">"data"</span>: {
          <span style="color:#34d399">"hub"</span>: <span style="color:#fbbf24">"LHR"</span>,
          <span style="color:#34d399">"zone"</span>: <span style="color:#fbbf24">"W1"</span>,
          <span style="color:#34d399">"direction"</span>: <span style="color:#fbbf24">"from_hub"</span>,
          <span style="color:#34d399">"recommended_car_type"</span>: <span style="color:#fbbf24">"Saloon"</span>,
          <span style="color:#34d399">"from_hub"</span>: [
            { <span style="color:#34d399">"car_type"</span>: <span style="color:#fbbf24">"Saloon"</span>, <span style="color:#34d399">"price_gbp"</span>: <span style="color:#a78bfa">75</span>, <span style="color:#34d399">"max_passengers"</span>: <span style="color:#a78bfa">3</span> },
            { <span style="color:#34d399">"car_type"</span>: <span style="color:#fbbf24">"People Carrier"</span>, <span style="color:#34d399">"price_gbp"</span>: <span style="color:#a78bfa">90</span>, <span style="color:#34d399">"max_passengers"</span>: <span style="color:#a78bfa">5</span> }
          ]
        }
      }]
    }]
  }
}</pre>

        <div class="label">Create a Booking</div>
        <pre><span style="color:#d4a843">curl</span> -X POST https://mcp.airport-pickups-london.com/a2a \\
  -H <span style="color:#34d399">"Content-Type: application/json"</span> \\
  -H <span style="color:#34d399">"x-api-key: your-api-key"</span> \\
  -d <span style="color:#fbbf24">'{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{
          "type": "data",
          "mimeType": "application/json",
          "data": {
            "skill": "create_booking",
            "origin": "Heathrow Terminal 5",
            "destination": "10 Downing Street, SW1A 2AA",
            "transfer_date": "2026-04-01",
            "transfer_time": "14:00",
            "passenger_name": "John Smith",
            "passenger_phone": "+447123456789",
            "passenger_email": "john@example.com",
            "passengers": 2,
            "car_type": "Saloon",
            "flight_number": "BA2534",
            "door_number": "10"
          }
        }]
      }
    }
  }'</span></pre>

        <div class="warning">The <code class="inline-code">create_booking</code> skill creates <strong>real reservations</strong>. Always get a quote first and confirm with the end user before booking.</div>

        <h3>Option 2: TextPart (Natural Language)</h3>
        <p>Send plain text. The agent will return <code class="inline-code">input-required</code> with the expected JSON schema.</p>

        <pre><span style="color:#fbbf24">{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [{
          "type": "text",
          "text": "How much is a ride from Heathrow to central London?"
        }]
      }
    }
  }</span></pre>

        <h3>Auto-Detection</h3>
        <p>If you omit the <code class="inline-code">skill</code> field from a DataPart, the agent auto-detects:</p>
        <ul>
          <li>Has <code class="inline-code">passenger_name</code>? &rarr; routes to <code class="inline-code">create_booking</code></li>
          <li>Has <code class="inline-code">origin</code> / <code class="inline-code">destination</code>? &rarr; routes to <code class="inline-code">get_quote</code></li>
        </ul>
      </div>
    </div>
  </section>

  <!-- tasks/get -->
  <section id="a2a-tasks-get">
    <h2>tasks/get</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/a2a</span>
      </div>
      <div class="endpoint-body">
        <p>Retrieve a previously created task by its ID. Tasks are stored in memory for 1 hour.</p>

        <div class="label">Example Request</div>
        <pre><span style="color:#fbbf24">{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/get",
  "params": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}</span></pre>

        <div class="label">Response</div>
        <p>Returns the full task object with status, artifacts, and history. Returns error code <code class="inline-code">-32001</code> if the task is not found or has expired.</p>
      </div>
    </div>
  </section>

  <!-- tasks/cancel -->
  <section id="a2a-tasks-cancel">
    <h2>tasks/cancel</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/a2a</span>
      </div>
      <div class="endpoint-body">
        <p>Cancel a task that is still in progress. Only tasks in <code class="inline-code">submitted</code>, <code class="inline-code">working</code>, or <code class="inline-code">input-required</code> states can be canceled.</p>

        <div class="label">Example Request</div>
        <pre><span style="color:#fbbf24">{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tasks/cancel",
  "params": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}</span></pre>

        <p>Returns the updated task with <code class="inline-code">status.state: "canceled"</code>, or error code <code class="inline-code">-32002</code> if the task has already completed.</p>
      </div>
    </div>
  </section>

  <!-- A2A JSON-RPC Errors -->
  <section id="a2a-errors">
    <h2>A2A JSON-RPC Errors</h2>
    <p>A2A uses JSON-RPC 2.0 error codes. All error responses follow this format:</p>
    <pre>{
  <span style="color:#34d399">"jsonrpc"</span>: <span style="color:#fbbf24">"2.0"</span>,
  <span style="color:#34d399">"error"</span>: { <span style="color:#34d399">"code"</span>: <span style="color:#a78bfa">-32601</span>, <span style="color:#34d399">"message"</span>: <span style="color:#fbbf24">"Method not found: foo/bar"</span> },
  <span style="color:#34d399">"id"</span>: <span style="color:#a78bfa">1</span>
}</pre>

    <table class="error-table">
      <thead>
        <tr><th>Code</th><th>Name</th><th>Meaning</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="status-code" style="color:#f87171">-32700</span></td><td>Parse Error</td><td>Invalid JSON in request body</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">-32600</span></td><td>Invalid Request</td><td>Missing <code class="inline-code">jsonrpc: "2.0"</code> or <code class="inline-code">method</code></td></tr>
        <tr><td><span class="status-code" style="color:#f87171">-32601</span></td><td>Method Not Found</td><td>Unknown method (only <code class="inline-code">message/send</code>, <code class="inline-code">tasks/get</code>, <code class="inline-code">tasks/cancel</code> supported)</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">-32602</span></td><td>Invalid Params</td><td>Missing or invalid parameters</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">-32603</span></td><td>Internal Error</td><td>Server-side error</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">-32000</span></td><td>Unauthorized</td><td>Missing or invalid API key</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">-32001</span></td><td>Task Not Found</td><td>Task ID does not exist or has expired (1hr TTL)</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">-32002</span></td><td>Task Not Cancelable</td><td>Task is already completed, failed, or canceled</td></tr>
      </tbody>
    </table>
  </section>

  <!-- Registration -->
  <section id="registration">
    <h2>Agent Registration</h2>
    <div class="note" style="margin-bottom: 20px; border-color: #d4a843;">
      <strong>Already an APL partner or agency?</strong> You do not need to self-register. Your API key and account have already been configured with your specific settings (account ID, payment type, billing, etc). Contact us to receive your key:
      <ul style="margin-top: 8px; padding-left: 20px;">
        <li>Email: <a href="mailto:info@airport-pickups-london.com" style="color:#d4a843;">info@airport-pickups-london.com</a></li>
        <li>Phone: <strong>020 3988 2168</strong></li>
        <li>WhatsApp: <strong>+44 7365 268

656</strong></li>
      </ul>
    </div>
    <p>For new AI agents and developers, get an API key instantly by self-registering below. No approval required &mdash; your key is returned immediately. Self-registered agents use APL&rsquo;s default booking account.</p>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method method-post">POST</span>
        <span class="endpoint-path">/a2a/register</span>
      </div>
      <div class="endpoint-body">
        <p>Public endpoint &mdash; no authentication needed. Rate limited to 3 registrations per IP per hour.</p>
        <h3>Request Body</h3>
        <table>
          <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code class="inline-code">name</code></td><td>string</td><td>Yes</td><td>Your agent or company name</td></tr>
            <tr><td><code class="inline-code">email</code></td><td>string</td><td>Yes</td><td>Contact email (used for duplicate detection)</td></tr>
            <tr><td><code class="inline-code">url</code></td><td>string</td><td>No</td><td>Your website URL</td></tr>
          </tbody>
        </table>
        <h3>Example Request</h3>
        <pre>{
  "name": "TravelBot AI",
  "email": "dev@travelbot.com",
  "url": "https://travelbot.com"
}</pre>
        <h3>Example Response <span style="color:#22c55e; font-size:13px;">(201 Created)</span></h3>
        <pre>{
  "agent_name": "TravelBot AI",
  "api_key": "a1b2c3d4e5f6...",
  "message": "API key created. Use this key in the x-api-key header for all A2A, REST API, and MCP requests."
}</pre>
        <div class="note">Your API key works across all endpoints: REST API (<code class="inline-code">/api/quote</code>, <code class="inline-code">/api/book</code>), A2A protocol (<code class="inline-code">/a2a</code>), and MCP (<code class="inline-code">/mcp</code>).</div>
      </div>
    </div>
  </section>

  <!-- Errors -->
  <section id="errors">
    <h2>Error Handling</h2>
    <p>The API uses standard HTTP status codes. Error responses include a JSON body with an <code class="inline-code">error</code> field.</p>
    <pre>{
  <span style="color:#34d399">"error"</span>: <span style="color:#fbbf24">"Missing required fields: transfer_date, passenger_name"</span>
}</pre>
    <table class="error-table">
      <thead>
        <tr><th>Status</th><th>Meaning</th><th>Common Causes</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="status-code" style="color:#f87171">400</span></td><td>Bad Request</td><td>Missing/invalid fields, location not found, no vehicles available</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">401</span></td><td>Unauthorized</td><td>Missing or invalid API key</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">429</span></td><td>Rate Limited</td><td>Too many requests &mdash; max 60/minute per IP</td></tr>
        <tr><td><span class="status-code" style="color:#f87171">500</span></td><td>Server Error</td><td>Internal error &mdash; please retry or contact support</td></tr>
      </tbody>
    </table>
  </section>

  <!-- Typical Flow -->
  <section id="flow">
    <h2>Typical Integration Flow</h2>
    <ol style="padding-left: 20px;">
      <li style="margin-bottom: 10px;"><strong>Get a quote</strong> &mdash; Call <code class="inline-code">POST /api/quote</code> with pickup, dropoff and date/time. Optionally include <code class="inline-code">requestedDiscountPercent</code> (0&ndash;5%) for A2A pricing negotiation.</li>
      <li style="margin-bottom: 10px;"><strong>Show options</strong> &mdash; Display available car types and prices to your customer. If a discount was applied, the response includes <code class="inline-code">appliedDiscountPercent</code>.</li>
      <li style="margin-bottom: 10px;"><strong>Collect details</strong> &mdash; Gather passenger name, phone, email, flight number (if airport pickup), and door number (if postcode destination)</li>
      <li style="margin-bottom: 10px;"><strong>Validate flight</strong> (airport pickups) &mdash; Call <code class="inline-code">POST /api/validate-flight</code> with the flight number and date to verify the flight and auto-detect the terminal. Show the customer: &ldquo;Your flight BA2534 (British Airways) arrives at Heathrow T5 at 14:30&rdquo;</li>
      <li style="margin-bottom: 10px;"><strong>Create booking</strong> &mdash; Call <code class="inline-code">POST /api/book</code> with all details and the chosen car type. The system automatically validates the flight number and registers the correct terminal and landing time.</li>
      <li style="margin-bottom: 10px;"><strong>Confirm to customer</strong> &mdash; Share the <code class="inline-code">booking_ref</code>, <code class="inline-code">flight_info</code>, and <code class="inline-code">meeting_point</code> instructions with your customer</li>
    </ol>
  </section>

  <!-- Agency Portal -->
  <section id="portal">
    <h2>Agency Portal</h2>
    <p>Manage your bookings, view reservation status, and track drivers through the agency portal:</p>
    <pre><a href="https://agency.airport-pickups-london.com" target="_blank" style="color: #d4a843; text-decoration: none;">https://agency.airport-pickups-london.com</a></pre>
    <p>Use the portal to:</p>
    <ul>
      <li>Search and view all your reservations</li>
      <li>Edit booking details and passenger information</li>
      <li>Track driver status in real time</li>
      <li>View booking history and invoices</li>
    </ul>
    <div class="note">Your agency login credentials are provided separately by APL. Contact us if you need access.</div>
  </section>

  <!-- Support -->
  <section id="support">
    <h2>Support</h2>
    <p>For API integration support, account setup, or technical issues:</p>
    <ul>
      <li>Email: <a href="mailto:info@aplcars.com" style="color: #d4a843;">info@aplcars.com</a></li>
      <li>Phone: +44 208 688 7744 (24 hours)</li>
      <li>WhatsApp: +44 7538 989360</li>
    </ul>
  </section>

  <div class="footer">
    &copy; 2026 Airport Pickups London &mdash; <a href="https://www.airport-pickups-london.com">www.airport-pickups-london.com</a> &mdash; <a href="/privacy">Privacy Policy</a>
  </div>

    </div>
  </main>

</div>

<script>
  // Scroll spy: highlight active sidebar link
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.sidebar-nav a[href^="#"]');

  function updateActive() {
    let current = '';
    for (const section of sections) {
      const top = section.getBoundingClientRect().top;
      if (top <= 80) current = section.id;
    }
    navLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === '#' + current);
    });
  }

  document.querySelector('.main-content').addEventListener('scroll', updateActive);
  window.addEventListener('scroll', updateActive);
  updateActive();
</script>

</body>
</html>`;

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(HTML);
});

module.exports = router;
