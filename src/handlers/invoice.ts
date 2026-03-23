import { Env } from '../index';
import { searchInvoices, jsonResponse } from '../utils/db';

export async function handleInvoice(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as { job_id?: string; customer_name?: string; invoice_number?: string };
    if (!body.job_id && !body.customer_name && !body.invoice_number) {
      return jsonResponse({ error: 'Missing job_id, customer_name, or invoice_number' }, 400);
    }

    const invoices = await searchInvoices(env.DB, body);
    if (!invoices.length) {
      return jsonResponse({ status: 'not_found', message: 'No invoices found' }, 404);
    }

    return jsonResponse({
      status: 'success',
      count: invoices.length,
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        job_id: inv.job_id,
        customer_name: inv.customer_name,
        total: inv.total,
        balance: inv.balance,
        status: inv.invoice_status,
        created_date: inv.created_date,
      })),
    });
  } catch (err) {
    console.error('Invoice handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
