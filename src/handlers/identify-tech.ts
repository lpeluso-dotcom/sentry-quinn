import { Env } from '../index';
import { getTechnicianByPhone, getJobById } from '../utils/db';
import { getTechnicianByPhoneFromST, getJobFromST } from '../utils/st-api';

export async function handleIdentifyTech(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as any;
    const phone = body.phone;

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: phone' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Try D1 first
    let tech = await getTechnicianByPhone(env.DB, phone);

    // Fallback to ST API
    if (!tech) {
      tech = await getTechnicianByPhoneFromST(env, phone);
    }

    if (!tech) {
      return new Response(
        JSON.stringify({
          identified: false,
          phone: phone,
          message: 'Technician not found'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get tech's current job from their appointments
    let current_job = null;
    if (tech.current_job_id) {
      // Try D1 first
      current_job = await getJobById(env.DB, tech.current_job_id);

      // Fallback to ST API
      if (!current_job) {
        current_job = await getJobFromST(env, tech.current_job_id);
      }
    }

    return new Response(
      JSON.stringify({
        identified: true,
        technician_id: tech.id,
        technician_name: tech.name,
        phone: phone,
        current_job: current_job ? {
          job_id: current_job.id,
          job_number: current_job.job_number,
          customer_name: current_job.customer_name,
          address: current_job.address,
          job_type: current_job.job_type,
          status: current_job.status,
          campaign: current_job.campaign || null
        } : null
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Identify tech handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
