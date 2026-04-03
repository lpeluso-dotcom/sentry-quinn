import { Env } from '../index';
import { getTechnicianByPhone, getJobById, jsonResponse } from '../utils/db';
import { getTechnicianByPhoneFromST, getJobFromST } from '../utils/st-api';
import { extractArgs } from '../utils/retell';

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
    const rawBody = (await req.json()) as Record<string, any>;
    const body = extractArgs(rawBody);
    const techName = body.technician_name || body.name;

    let tech: any = null;

    // Try phone first if provided and not a template literal
    if (body.phone && !body.phone.includes('{{')) {
      tech = await getTechnicianByPhone(env.DB, body.phone);
      if (!tech) {
        tech = await getTechnicianByPhoneFromST(env, body.phone);
      }
    }

    // Fall back to name search
    if (!tech && techName) {
      tech = await findTechByName(env.DB, techName);
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

    // Get current job from dispatch status cache (polled from ST every few minutes)
    let current_job = null;
    let dispatch_status: string | null = null;
    let next_job = null;

    try {
      const status = await env.DB.prepare(
        `SELECT * FROM tech_current_status WHERE technician_id = ?`
      ).bind(tech.id).first() as any;

      if (status && status.current_job_id) {
        dispatch_status = status.dispatch_status;
        current_job = {
          job_id: status.current_job_id,
          job_number: status.current_job_number,
          customer_name: status.current_customer,
          location: status.current_address,
          job_type: status.current_job_type,
          job_status: status.dispatch_status,
          appointment_start: status.current_appointment_start,
          appointment_end: status.current_appointment_end,
        };
        if (status.next_job_id && status.next_job_id !== status.current_job_id) {
          next_job = {
            job_id: status.next_job_id,
            customer_name: status.next_customer,
            location: status.next_address,
            start_time: status.next_start_time,
          };
        }
      }
    } catch { /* status cache is optional — fall back to legacy lookup */ }

    // Legacy fallback: if no cached status, try the old approach
    if (!current_job && tech.jobId) {
      const legacyJob = await getJobById(env.DB, String(tech.jobId))
        || await getJobFromST(env, String(tech.jobId));
      if (legacyJob) {
        current_job = {
          job_id: legacyJob.id || legacyJob.job_id,
          customer_name: legacyJob.customer_name || legacyJob.customerName,
          location: legacyJob.location || legacyJob.address,
          job_type: legacyJob.job_type_name || legacyJob.job_type || legacyJob.jobType,
          job_status: legacyJob.job_status || legacyJob.jobStatus,
        };
      }
    }

    // Get coaching profile (Siro-derived, subtle hints for Dawn)
    let coaching_hints: string[] = [];
    let coaching_focus: string | null = null;
    try {
      const profile = await env.DB.prepare(
        `SELECT dawn_hints, coaching_focus, win_rate, top_strengths FROM tech_coaching_profiles WHERE technician_id = ?`
      ).bind(tech.id).first() as any;
      if (profile) {
        coaching_hints = JSON.parse(profile.dawn_hints || '[]');
        coaching_focus = profile.coaching_focus;
      }
    } catch { /* coaching profile is optional — never fail the call */ }

    return jsonResponse({
      identified: true,
      technician_id: tech.id,
      technician_name: tech.name,
      phone: tech.phone || body.phone,
      dispatch_status,
      current_job,
      next_job,
      coaching_hints,
      coaching_focus,
    });
  } catch (err) {
    console.error('Identify tech handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
