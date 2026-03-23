import { Env } from '../index';
import { searchEstimates, jsonResponse } from '../utils/db';

export async function handleEstimate(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as { job_id?: string; customer_name?: string; estimate_id?: string };
    if (!body.job_id && !body.customer_name && !body.estimate_id) {
      return jsonResponse({ error: 'Missing job_id, customer_name, or estimate_id' }, 400);
    }

    const estimates = await searchEstimates(env.DB, body);
    if (!estimates.length) {
      return jsonResponse({ status: 'not_found', message: 'No estimates found' }, 200);
    }

    return jsonResponse({
      status: 'success',
      count: estimates.length,
      estimates: estimates.map(est => ({
        id: est.id,
        job_id: est.job_id,
        customer_name: est.customer_name,
        status: est.status,
        summary: est.summary,
        total: est.total,
        items: est.items_json ? JSON.parse(est.items_json) : [],
        created_date: est.created_date,
      })),
    });
  } catch (err) {
    console.error('Estimate handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
