import { Env } from '../index';
import { getJobById, jsonResponse } from '../utils/db';
import { getJobFromST } from '../utils/st-api';

export async function handleJob(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as {
      job_id?: string;
      customer_name?: string;
      address?: string;
    };

    let job = null;

    // Try job_id first
    if (body.job_id) {
      job = await getJobById(env.DB, body.job_id);
      if (!job) job = await getJobFromST(env, body.job_id);
    }

    // Fuzzy search by customer name or address
    if (!job && (body.customer_name || body.address)) {
      const query = body.customer_name || body.address || '';
      const results = await env.DB.prepare(`
        SELECT job_id as id, customer_name, location, job_type, job_status,
               technician, scheduled_date, completed_date, revenue
        FROM jobs
        WHERE (customer_name LIKE ? OR location LIKE ?)
        ORDER BY created_at DESC LIMIT 5
      `).bind(`%${query}%`, `%${query}%`).all();
      if (results?.results?.length) {
        job = results.results[0];
      }
    }

    if (!job) {
      return jsonResponse({ error: 'Job not found' }, 404);
    }

    return jsonResponse({
      status: 'success',
      job: {
        id: job.id || job.job_id,
        customer_name: job.customer_name || job.customerName,
        location: job.location,
        job_type: job.job_type_name || job.job_type,
        job_status: job.job_status || job.jobStatus,
        technician: job.technician,
        scheduled_date: job.scheduled_date,
        completed_date: job.completed_date || job.completedOn,
        revenue: job.revenue,
      },
    });
  } catch (err) {
    console.error('Job handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
