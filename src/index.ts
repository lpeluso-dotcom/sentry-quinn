import { Router } from 'itty-router';
import { handleAppointments } from './handlers/appointments';
import { handleJob } from './handlers/job';
import { handleCustomer } from './handlers/customer';
import { handleLocation } from './handlers/location';
import { handlePricebook } from './handlers/pricebook';
import { handleSaveDebrief } from './handlers/save-debrief';
import { handleEscalate } from './handlers/escalate';
import { handleWebhook } from './handlers/webhook';

const router = Router();

export interface Env {
  DB: D1Database;
  STATE: KVNamespace;
  CACHE: KVNamespace;
  RETELL_API_KEY?: string;
  ST_APP_KEY?: string;
  ST_CLIENT_ID?: string;
  ST_CLIENT_SECRET?: string;
  MAKE_WEBHOOK_TRANSCRIPT?: string;
  MAKE_WEBHOOK_ESCALATE?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return router.handle(request, env, ctx);
  },
};

// Health check
router.get('/health', () => ({
  status: 'ok',
  service: 'sentry-quinn',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}));

// Implemented handlers
router.post('/api/quinn/appointments', (req, env) => handleAppointments(req, env));
router.post('/api/quinn/job', (req, env) => handleJob(req, env));
router.post('/api/quinn/customer', (req, env) => handleCustomer(req, env));
router.post('/api/quinn/location', (req, env) => handleLocation(req, env));
router.post('/api/quinn/pricebook', (req, env) => handlePricebook(req, env));
router.post('/api/quinn/save-debrief', (req, env) => handleSaveDebrief(req, env));
router.post('/api/quinn/escalate', (req, env) => handleEscalate(req, env));
router.post('/api/quinn/webhook', (req, env) => handleWebhook(req, env));

// Placeholder for endpoints not yet in use
router.post('/api/quinn/identify-tech', () =>
  new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
);
router.post('/api/quinn/customer-search', () =>
  new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
);
router.post('/api/quinn/equipment', () =>
  new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
);
router.post('/api/quinn/invoice', () =>
  new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
);
router.post('/api/quinn/estimate', () =>
  new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
);

// Fallback
router.all('*', () =>
  new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
);

export { router };
