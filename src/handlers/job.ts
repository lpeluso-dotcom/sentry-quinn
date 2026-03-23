import { extractArgs } from '../utils/retell';
import { Env } from '../index';
import { getJobById, searchCustomers, jsonResponse } from '../utils/db';
import { getJobFromST } from '../utils/st-api';

export async function handleJob(req: Request, env: Env): Promise<Response> {
  try {
    const rawBody = (await req.json()) as Record<string, any>;
    const body = extractArgs(rawBody) as {
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

    // Fuzzy search by customer name or address (word-split for STT resilience)
    if (!job && (body.customer_name || body.address)) {
      const query = body.customer_name || body.address || '';
      const clean = query.replace(/[''`.,!?]/g, '');

      // Try exact match first
      const exact = await env.DB.prepare(`
        SELECT job_id as id, customer_name, location, job_type, job_status,
               technician, scheduled_date, completed_date, revenue
        FROM jobs
        WHERE (customer_name LIKE ? OR customer_name LIKE ? OR location LIKE ? OR location LIKE ?)
        ORDER BY created_at DESC LIMIT 5
      `).bind(`%${query}%`, `%${clean}%`, `%${query}%`, `%${clean}%`).all();

      if (exact?.results?.length) {
        job = exact.results[0];
      } else {
        // Word-split fuzzy match
        const words = clean.split(/\s+/).filter(w => w.length >= 3);
        if (words.length > 0) {
          const conds = words.map(() => 'LOWER(customer_name) LIKE LOWER(?)').join(' OR ');
          const params = words.map(w => `%${w}%`);
          const fuzzy = await env.DB.prepare(`
            SELECT job_id as id, customer_name, location, job_type, job_status,
                   technician, scheduled_date, completed_date, revenue
            FROM jobs WHERE ${conds} ORDER BY created_at DESC LIMIT 5
          `).bind(...params).all();
          if (fuzzy?.results?.length) {
            job = fuzzy.results[0];
          }
        }
      }
    }

    if (job) {
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
    }

    // No job found — try customer search as fallback so Dawn has something useful
    const query = body.customer_name || body.address || '';
    if (query) {
      const customers = await searchCustomers(env.DB, query);
      if (customers.length > 0) {
        return jsonResponse({
          status: 'no_job_found',
          message: `No recent job found, but found ${customers.length} matching customer(s). You can ask the tech for a job number or more details.`,
          customers: customers.slice(0, 3).map(c => ({
            id: c.id,
            name: c.name,
            address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(', '),
            phone: c.phone || '',
          })),
        });
      }
    }

    return jsonResponse({ status: 'not_found', message: 'No job or customer found matching that name. Ask the tech for a job number or try a different name.' }, 200);
  } catch (err) {
    console.error('Job handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
