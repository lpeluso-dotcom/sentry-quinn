import { Env } from '../index';
import { getTechnicianByPhone, getJobById, jsonResponse } from '../utils/db';
import { getTechnicianByPhoneFromST, getJobFromST } from '../utils/st-api';

async function findTechByName(db: D1Database, name: string): Promise<any> {
  // Try exact match first, then LIKE match
  const exact = await db.prepare(
    `SELECT tech_id as id, name, email, phone FROM technicians WHERE LOWER(name) = LOWER(?) AND active = 1 LIMIT 1`
  ).bind(name).first();
  if (exact) return exact;

  // Try partial match (first name or last name)
  const partial = await db.prepare(
    `SELECT tech_id as id, name, email, phone FROM technicians WHERE LOWER(name) LIKE LOWER(?) AND active = 1 LIMIT 1`
  ).bind(`%${name}%`).first();
  return partial;
}

export async function handleIdentifyTech(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as { phone?: string; name?: string };

    let tech: any = null;

    // Try phone first if provided and not a template literal
    if (body.phone && !body.phone.includes('{{')) {
      tech = await getTechnicianByPhone(env.DB, body.phone);
      if (!tech) {
        tech = await getTechnicianByPhoneFromST(env, body.phone);
      }
    }

    // Fall back to name search
    if (!tech && body.name) {
      tech = await findTechByName(env.DB, body.name);
    }

    if (!tech) {
      return jsonResponse({
        identified: false,
        phone: body.phone || null,
        name: body.name || null,
        message: 'Technician not found. Ask the caller their name if you haven\'t already.',
        hint: 'Try calling identify_tech again with their full name in the "name" field.'
      });
    }

    // Get current job
    let current_job = null;
    const currentJobId = tech.jobId;
    if (currentJobId) {
      current_job = await getJobById(env.DB, String(currentJobId))
        || await getJobFromST(env, String(currentJobId));
    }

    return jsonResponse({
      identified: true,
      technician_id: tech.id,
      technician_name: tech.name,
      phone: tech.phone || body.phone,
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
