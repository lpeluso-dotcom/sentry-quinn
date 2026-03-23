import { Env } from '../index';
import { getTechnicianByPhone, getJobById, jsonResponse } from '../utils/db';
import { getTechnicianByPhoneFromST, getJobFromST } from '../utils/st-api';

export async function handleIdentifyTech(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as { phone?: string };
    if (!body.phone) {
      return jsonResponse({ error: 'Missing required field: phone' }, 400);
    }

    // Try D1 first, fall back to ST API
    let tech = await getTechnicianByPhone(env.DB, body.phone);
    if (!tech) {
      tech = await getTechnicianByPhoneFromST(env, body.phone);
    }

    if (!tech) {
      return jsonResponse({ identified: false, phone: body.phone, message: 'Technician not found' });
    }

    // Get current job — ST API returns jobId on the tech record when dispatched.
    // D1 technicians table does NOT have current job info, so this only works via ST path.
    let current_job = null;
    const currentJobId = tech.jobId; // ST field name from technicians list/detail endpoint
    if (currentJobId) {
      current_job = await getJobById(env.DB, String(currentJobId))
        || await getJobFromST(env, String(currentJobId));
    }

    return jsonResponse({
      identified: true,
      technician_id: tech.id,
      technician_name: tech.name,
      phone: body.phone,
      current_job: current_job ? {
        job_id: current_job.id || current_job.job_id,
        customer_name: current_job.customer_name || current_job.customerName,
        location: current_job.location || current_job.address,
        job_type: current_job.job_type_name || current_job.job_type || current_job.jobType,
        job_status: current_job.job_status || current_job.jobStatus,
      } : null,
    });
  } catch (err) {
    console.error('Identify tech handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
