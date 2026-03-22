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
        SELECT j.*, c.name as customer_name, l.address, l.city, l.state
        FROM jobs j
        LEFT JOIN customers c ON j.customer_id = c.id
        LEFT JOIN locations l ON j.location_id = l.id
        WHERE (c.name LIKE ? OR l.address LIKE ?)
        ORDER BY j.created_on DESC LIMIT 5
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
          id: job.id,
          job_number: job.jobNumber,
          customer_id: job.customerId,
          customer_name: job.customer_name,
          location_id: job.locationId,
          address: job.address,
          city: job.city,
          state: job.state,
          job_type: job.job_type_name,
          job_status: job.jobStatus,
          completed_on: job.completedOn,
          notes: job.notes || '',
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
