import http from 'k6/http';
import { check, sleep } from 'k6';

const env = JSON.parse(open('./k6-env.json'));
const BASE_URL = 'http://host.docker.internal:3000/api';
const WIDGET_KEY = env.webWidgetKey;

export const options = {
  vus: 50,
  duration: '45s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};

export function setup() {
  // Login to get a valid staff token for the dashboard API calls
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: 'salon@glambot.io',
    password: 'salon123'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status !== 200) {
    throw new Error('Login failed: ' + loginRes.body);
  }

  const token = loginRes.json('token');
  return { token };
}

export default function (data) {
  const token = data.token;
  
  // Randomly decide which persona this VU will act as for this iteration
  const scenario = Math.random();

  if (scenario < 0.3) {
    // ---------------------------------------------------------
    // Persona A: Salon Staff (30% of traffic)
    // Viewing dashboards, checking bookings, active conversations
    // ---------------------------------------------------------
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    let res = http.get(`${BASE_URL}/tenants/me/dashboard`, { headers });
    check(res, { 'dashboard success': (r) => r.status === 200 });

    res = http.get(`${BASE_URL}/tenants/me/bookings?status=pending`, { headers });
    check(res, { 'bookings success': (r) => r.status === 200 });

    res = http.get(`${BASE_URL}/tenants/me/conversations`, { headers });
    check(res, { 'conversations success': (r) => r.status === 200 });

    sleep(1);

  } else if (scenario < 0.7) {
    // ---------------------------------------------------------
    // Persona B: Web Client (40% of traffic)
    // Loads widget, asks AI a question to trigger agent
    // ---------------------------------------------------------
    const sessionId = `k6-client-${__VU}-${__ITER}`;

    // 1. Load Widget Config
    let res = http.get(`${BASE_URL}/public/widget/config?key=${WIDGET_KEY}`);
    check(res, { 'widget config success': (r) => r.status === 200 });
    
    // 2. Chat with AI (this triggers glambot_ai_interactions_total!)
    const payload = JSON.stringify({
      key: WIDGET_KEY,
      sessionId: sessionId,
      message: 'Hi, I want to book a gel manicure for tomorrow morning. Do you have availability?'
    });

    res = http.post(`${BASE_URL}/public/widget/chat`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: '30s' // AI can take a few seconds
    });
    
    check(res, { 'ai chat success': (r) => r.status === 200 });
    
    sleep(2);
  } else {
    // ---------------------------------------------------------
    // Persona C: Webhook Integrations (30% of traffic)
    // Simulating Meta / Stripe webhooks inbound traffic
    // (We hit the healthcheck rapidly to simulate background load)
    // ---------------------------------------------------------
    for(let i=0; i<3; i++) {
        let res = http.get(`http://host.docker.internal:3000/health`);
        check(res, { 'health check ok': (r) => r.status === 200 });
        sleep(0.5);
    }
  }
}
