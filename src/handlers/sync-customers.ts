import type { Env } from '../index';
import { jsonResponse } from '../utils/db';
import { getSTToken } from '../utils/st-api';

const TENANT_ID = '431848990';
const API_BASE = 'https://api.servicetitan.io';

export async function handleSyncCustomers(request: Request, env: Env): Promise<Response> {
  const key = request.headers.get('x-admin-key');
  if (key !== 'quinn-sync-2026') return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    const token = await getSTToken(env);
    if (!token) return jsonResponse({ error: 'Failed to get ST OAuth token' }, 500);

    let page = 1;
    let totalFetched = 0;
    let totalUpserted = 0;
    let hasMore = true;
    const PAGE_SIZE = 200;
    const MAX_PAGES = 100;

    while (hasMore && page <= MAX_PAGES) {
      const url = `${API_BASE}/crm/v2/tenant/${TENANT_ID}/customers?pageSize=${PAGE_SIZE}&page=${page}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'ST-App-Key': env.ST_APP_KEY!,
        },
      });

      if (!res.ok) {
        return jsonResponse({ error: `ST API error: ${res.status}`, page, totalFetched }, 500);
      }

      const data = await res.json() as any;
      const customers = data.data || [];
      hasMore = data.hasMore || false;
      totalFetched += customers.length;

      if (customers.length > 0) {
        const stmt = env.DB.prepare(
          `INSERT OR REPLACE INTO customers (customer_id, name, phone, email, address, city, state, zip, customer_type, active, created_date, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        );

        const BATCH_SIZE = 50;
        for (let i = 0; i < customers.length; i += BATCH_SIZE) {
          const batch = customers.slice(i, i + BATCH_SIZE);
          await env.DB.batch(
            batch.map((c: any) => {
              const addr = c.address || {};
              return stmt.bind(
                c.id,
                c.name || '',
                c.phoneSettings?.phoneNumber || '',
                c.email || '',
                [addr.street, addr.unit].filter(Boolean).join(', ') || '',
                addr.city || '',
                addr.state || '',
                addr.zip || '',
                c.type || 'Residential',
                c.active !== false ? 1 : 0,
                c.createdOn || '',
              );
            })
          );
          totalUpserted += batch.length;
        }
      }

      page++;
    }

    // Also sync customer_contacts for phone/email enrichment
    let contactPage = 1;
    let contactsTotal = 0;
    let contactsHasMore = true;
    while (contactsHasMore && contactPage <= MAX_PAGES) {
      const url = `${API_BASE}/crm/v2/tenant/${TENANT_ID}/customers/contacts?pageSize=${PAGE_SIZE}&page=${contactPage}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'ST-App-Key': env.ST_APP_KEY!,
        },
      });
      if (!res.ok) break;
      const data = await res.json() as any;
      const contacts = data.data || [];
      contactsHasMore = data.hasMore || false;
      contactsTotal += contacts.length;

      if (contacts.length > 0) {
        const cStmt = env.DB.prepare(
          `INSERT OR REPLACE INTO customer_contacts (id, customer_id, type, value, memo)
           VALUES (?, ?, ?, ?, ?)`
        );
        const BATCH_SIZE = 50;
        for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
          const batch = contacts.slice(i, i + BATCH_SIZE);
          await env.DB.batch(
            batch.map((c: any) => cStmt.bind(c.id, c.customerId, c.type || '', c.value || '', c.memo || ''))
          );
        }
      }
      contactPage++;
    }

    return jsonResponse({
      status: 'success',
      customers: { fetched: totalFetched, upserted: totalUpserted, pages: page - 1 },
      contacts: { fetched: contactsTotal, pages: contactPage - 1 },
    });
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
}
