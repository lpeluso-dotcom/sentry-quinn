import { Env } from '../index';
import { getCustomerById } from '../utils/db';
import { getCustomerFromST } from '../utils/st-api';

export async function handleCustomer(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as { customer_id: string };

    if (!body.customer_id) {
      return new Response(
        JSON.stringify({ error: 'Missing customer_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Try D1 first
    let customer = await getCustomerById(env.DB, body.customer_id);

    // Fallback to ST API
    if (!customer) {
      customer = await getCustomerFromST(env, body.customer_id);
    }

    if (!customer) {
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email || '',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Customer handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
