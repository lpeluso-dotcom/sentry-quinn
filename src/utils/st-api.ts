import { Env } from '../index';
import { normalizePhone } from './db';

const TENANT_ID = '431848990';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSTToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const clientId = env.ST_CLIENT_ID;
  const clientSecret = env.ST_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('ST credentials missing');

  const response = await fetch('https://auth.servicetitan.io/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'accounting.jobs jpm.jobs crm.customers dispatch.dispatch telecom.calls',
    }).toString(),
  });

  if (!response.ok) throw new Error(`ST token error: ${response.status}`);

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000 - 60000,
  };
  return data.access_token;
}

export async function stGet(env: Env, path: string): Promise<any> {
  const token = await getSTToken(env);
  const response = await fetch(`https://api.servicetitan.io${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ST API error: ${response.status}`);
  return await response.json();
}

// Generic safe ST entity fetch — handles 404 and errors uniformly
async function stGetEntity(env: Env, path: string, label: string): Promise<any> {
  try {
    return await stGet(env, path);
  } catch (err) {
    console.error(`ST ${label} error:`, err);
    return null;
  }
}

export async function getTechnicianByPhoneFromST(env: Env, phone: string): Promise<any> {
  try {
    const data = await stGet(env, `/settings/v2/tenant/${TENANT_ID}/technicians?pageSize=200`);
    const technicians = data?.pageItems || [];
    const normalized = normalizePhone(phone);

    const tech = technicians.find((t: any) => {
      const techPhone = normalizePhone(t.mobilePhone || t.phone || '');
      return techPhone === normalized;
    });

    // Return matched tech directly — list endpoint has all needed fields.
    // tech.jobId and tech.appoitmentId (sic) contain current dispatch state.
    return tech || null;
  } catch (err) {
    console.error('ST tech lookup error:', err);
    return null;
  }
}

export function getTechnicianAppointments(env: Env, technicianId: string) {
  return stGetEntity(env,
    `/dispatch/v2/tenant/${TENANT_ID}/appointment-assignments?technicianId=${technicianId}`,
    'appointments'
  ).then(d => d?.pageItems || []);
}

export function getCustomerFromST(env: Env, id: string) {
  return stGetEntity(env, `/crm/v2/tenant/${TENANT_ID}/customers/${id}`, 'customer');
}

export function getJobFromST(env: Env, id: string) {
  return stGetEntity(env, `/jpm/v2/tenant/${TENANT_ID}/jobs/${id}`, 'job');
}

export function getLocationFromST(env: Env, id: string) {
  return stGetEntity(env, `/crm/v2/tenant/${TENANT_ID}/locations/${id}`, 'location');
}

export function getInvoiceFromST(env: Env, id: string) {
  return stGetEntity(env, `/accounting/v2/tenant/${TENANT_ID}/invoices/${id}`, 'invoice');
}

export async function createSTTask(env: Env, taskData: {
  name: string; description?: string; businessUnitId?: string; assignedToId?: string;
  jobId?: string; customerId?: string; type?: string; source?: string; priority?: string;
}): Promise<any> {
  try {
    const token = await getSTToken(env);
    const response = await fetch(
      `https://api.servicetitan.io/taskmanagement/v2/tenant/${TENANT_ID}/tasks`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskData.name,
          description: taskData.description || '',
          businessUnitId: taskData.businessUnitId || '4921847',
          assignedToId: taskData.assignedToId || '33327615',
          jobId: taskData.jobId || null,
          customerId: taskData.customerId || null,
          taskTypeId: taskData.type || '78250217',
          taskSourceId: taskData.source || '78247908',
          priority: taskData.priority || 'medium',
        }),
      }
    );
    if (!response.ok) throw new Error(`ST task creation error: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('ST create task error:', err);
    return null;
  }
}
