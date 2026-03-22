import { Env } from '../index';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSTToken(env: Env): Promise<string> {
  // Check cache
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const tenantId = '431848990';
  const clientId = env.ST_CLIENT_ID;
  const clientSecret = env.ST_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('ST credentials missing');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'accounting.jobs jpm.jobs crm.customers dispatch.dispatch telecom.calls',
  });

  const response = await fetch('https://auth.servicetitan.io/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`ST token error: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  const token = data.access_token;
  const expiresIn = data.expires_in || 3600;

  cachedToken = {
    token,
    expiresAt: Date.now() + expiresIn * 1000 - 60000, // Refresh 1 min before expiry
  };

  return token;
}

export async function stGet(env: Env, path: string): Promise<any> {
  const token = await getSTToken(env);
  const url = `https://api.servicetitan.io${path}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    // ST API returns 404 for not found — return null instead of throwing
    if (response.status === 404) return null;
    throw new Error(`ST API error: ${response.status}`);
  }

  return await response.json();
}

export async function getTechnicianAppointments(env: Env, technicianId: string): Promise<any[]> {
  try {
    const tenantId = '431848990';
    const data = await stGet(env, `/dispatch/v2/tenant/${tenantId}/appointment-assignments?technicianId=${technicianId}`);
    return data?.pageItems || [];
  } catch (err) {
    console.error('ST appointments error:', err);
    return [];
  }
}

export async function getCustomerFromST(env: Env, customerId: string): Promise<any> {
  try {
    const tenantId = '431848990';
    return await stGet(env, `/crm/v2/tenant/${tenantId}/customers/${customerId}`);
  } catch (err) {
    console.error('ST customer error:', err);
    return null;
  }
}

export async function getJobFromST(env: Env, jobId: string): Promise<any> {
  try {
    const tenantId = '431848990';
    return await stGet(env, `/jpm/v2/tenant/${tenantId}/jobs/${jobId}`);
  } catch (err) {
    console.error('ST job error:', err);
    return null;
  }
}

export async function getLocationFromST(env: Env, locationId: string): Promise<any> {
  try {
    const tenantId = '431848990';
    return await stGet(env, `/crm/v2/tenant/${tenantId}/locations/${locationId}`);
  } catch (err) {
    console.error('ST location error:', err);
    return null;
  }
}

export async function getInvoiceFromST(env: Env, invoiceId: string): Promise<any> {
  try {
    const tenantId = '431848990';
    return await stGet(env, `/accounting/v2/tenant/${tenantId}/invoices/${invoiceId}`);
  } catch (err) {
    console.error('ST invoice error:', err);
    return null;
  }
}

export async function createSTTask(
  env: Env,
  taskData: {
    name: string;
    description?: string;
    businessUnitId?: string;
    assignedToId?: string;
    jobId?: string;
    customerId?: string;
    type?: string;
    source?: string;
    priority?: string;
  }
): Promise<any> {
  try {
    const tenantId = '431848990';
    const token = await getSTToken(env);

    const body = {
      name: taskData.name,
      description: taskData.description || '',
      businessUnitId: taskData.businessUnitId || '4921847', // HVAC Service default
      assignedToId: taskData.assignedToId || '33327615', // Jessica Gale default
      jobId: taskData.jobId || null,
      customerId: taskData.customerId || null,
      taskTypeId: taskData.type || '78250217', // Dispatch/Scheduling
      taskSourceId: taskData.source || '78247908', // CIC
      priority: taskData.priority || 'medium',
    };

    const response = await fetch(`https://api.servicetitan.io/taskmanagement/v2/tenant/${tenantId}/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`ST task creation error: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error('ST create task error:', err);
    return null;
  }
}
