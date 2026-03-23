import { Env } from '../index';
import { searchCustomers, jsonResponse } from '../utils/db';

export async function handleCustomerSearch(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as Record<string, any>;
    const query = body.customer_name || body.name || body.phone || body.customer_id || '';
    if (!query) {
      return jsonResponse({ error: 'Missing name, phone, or customer_id' }, 400);
    }

    const customers = await searchCustomers(env.DB, query);
    if (!customers.length) {
      return jsonResponse({ status: 'not_found', message: 'No customers found' }, 200);
    }

    return jsonResponse({
      status: 'success',
      count: customers.length,
      customers: customers.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        email: c.email || '',
        address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(', '),
      })),
    });
  } catch (err) {
    console.error('Customer search handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
