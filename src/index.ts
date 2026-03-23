import { Router } from 'itty-router';
import { handleAppointments } from './handlers/appointments';
import { handleJob } from './handlers/job';
import { handleCustomer } from './handlers/customer';
import { handleLocation } from './handlers/location';
import { handlePricebook } from './handlers/pricebook';
import { handleSaveDebrief } from './handlers/save-debrief';
import { handleEscalate } from './handlers/escalate';
import { handleWebhook } from './handlers/webhook';
import { handleIdentifyTech } from './handlers/identify-tech';
import { handleCustomerSearch } from './handlers/customer-search';
import { handleEquipment } from './handlers/equipment';
import { handleInvoice } from './handlers/invoice';
import { handleEstimate } from './handlers/estimate';
import { handleSyncCustomers } from './handlers/sync-customers';
import { handleDigest } from './handlers/digest';

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

router.get('/health', () => new Response(
  JSON.stringify({ status: 'ok', service: 'sentry-quinn', version: '2.2.0', timestamp: new Date().toISOString() }),
  { status: 200, headers: { 'Content-Type': 'application/json' } }
));

router.post('/api/quinn/identify-tech', (req, env) => handleIdentifyTech(req, env));
router.post('/api/quinn/appointments', (req, env) => handleAppointments(req, env));
router.post('/api/quinn/job', (req, env) => handleJob(req, env));
router.post('/api/quinn/customer', (req, env) => handleCustomer(req, env));
router.post('/api/quinn/customer-search', (req, env) => handleCustomerSearch(req, env));
router.post('/api/quinn/location', (req, env) => handleLocation(req, env));
router.post('/api/quinn/pricebook', (req, env) => handlePricebook(req, env));
router.post('/api/quinn/equipment', (req, env) => handleEquipment(req, env));
router.post('/api/quinn/invoice', (req, env) => handleInvoice(req, env));
router.post('/api/quinn/estimate', (req, env) => handleEstimate(req, env));
router.post('/api/quinn/save-debrief', (req, env) => handleSaveDebrief(req, env));
router.post('/api/quinn/escalate', (req, env) => handleEscalate(req, env));
router.post('/api/quinn/webhook', (req, env) => handleWebhook(req, env));
router.post('/api/admin/sync-customers', (req, env) => handleSyncCustomers(req, env));
router.get('/api/quinn/digest', (req, env) => handleDigest(req, env));

router.all('*', () =>
  new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
);

export { router };
