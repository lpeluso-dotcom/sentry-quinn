import { Env } from '../index';
import { getJobById } from '../utils/db';
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
      // Try D1 first (cached)
      job = await getJobById(env.DB, body.job_id);

      // Fallback to ST API
      if (!job) {
        job = await getJobFromST(env, body.job_id);
      }
    }

    // If not found and customer_name or address provided, do fuzzy search on D1
    if (!job && (body.customer_name || body.address)) {
      const query = body.customer_name || body.address || '';
      const stmt = env.DB.prepare(`
        SELECT j.job_id as id, j.customer_name, j.location, j.job_type, j.job_status,
               j.technician, j.scheduled_date, j.completed_date, j.revenue
        FROM jobs j
        WHERE (j.customer_name LIKE ? OR j.location LIKE ?)
        ORDER BY j.created_at DESC LIMIT 5
      `);
      const results = await stmt.bind(`%${query}%`, `%${query}%`).all();
      if (results?.results && results.results.length > 0) {
        job = results.results[0];
      }
    }

    if (!job) {
      return new Response(
        JSON.stringify({
          error: 'Job not found',
          details: 'Could not find job with provided ID, customer name, or address',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        job: {
          id: job.id || job.job_id,
          customer_name: job.customer_name,
          location: job.location,
          job_type: job.job_type_name || job.job_type,
          job_status: job.job_status || job.jobStatus,
          technician: job.technician,
          scheduled_date: job.scheduled_date,
          completed_date: job.completed_date || job.completedOn,
          revenue: job.revenue,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Job handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
