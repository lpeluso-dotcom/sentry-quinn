import { Env } from '../index';
import { extractArgs } from '../utils/retell';
import { jsonResponse, getTechnicianByPhone, getJobById } from '../utils/db';
import { getTechnicianByPhoneFromST, getTechnicianAppointments, getJobFromST } from '../utils/st-api';

async function findTechByName(db: D1Database, name: string) {
  const exact = await db.prepare(
    `SELECT tech_id as id, name, email, phone FROM technicians WHERE LOWER(name) = LOWER(?) AND active = 1 LIMIT 1`
  ).bind(name).first();
  if (exact) return exact;

  return db.prepare(
    `SELECT tech_id as id, name, email, phone FROM technicians WHERE LOWER(name) LIKE LOWER(?) AND active = 1 LIMIT 1`
  ).bind(`%${name}%`).first();
}

/**
 * Find the tech's current/most-recent job from today's ST appointments.
 * Priority: Working (on-site) > Dispatched (en route) > most recent Done (just finished)
 */
async function findCurrentJob(env: Env, techId: string) {
  try {
    const appointments = await getTechnicianAppointments(env, techId);
    if (!appointments || appointments.length === 0) return null;

    const today = new Date().toISOString().split('T')[0];
    const todayAppts = appointments.filter(
      (apt: any) => apt.startDateTime?.startsWith(today)
    );
    if (todayAppts.length === 0) return null;

    const working = todayAppts.find((a: any) => a.status === 'Working');
    const dispatched = todayAppts.find((a: any) => a.status === 'Dispatched');
    const done = todayAppts
      .filter((a: any) => a.status === 'Done')
      .sort((a: any, b: any) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime())[0];

    const best = working || dispatched || done;
    if (!best) return null;

    const jobId = String(best.jobId);
    const job: any = await getJobById(env.DB, jobId) || await getJobFromST(env, jobId);

    if (job) {
      return {
        job_id: job.id || job.job_id || jobId,
        customer_name: job.customer_name || job.customerName || best.customerName || 'Unknown',
        location: job.location || job.address || best.address || '',
        job_type: job.job_type_name || job.job_type || job.jobType || '',
        job_status: best.status,
      };
    }

    return {
      job_id: jobId,
      customer_name: best.customerName || 'Unknown',
      location: best.address || '',
      job_type: '',
      job_status: best.status,
    };
  } catch (err) {
    console.error('findCurrentJob error:', err);
    return null;
  }
}

export async function handleIdentifyTech(req: Request, env: Env): Promise<Response> {
  try {
    const rawBody = await req.json() as any;
    const body = extractArgs(rawBody);
    const techName = body.technician_name || body.name;

    let tech: any = null;

    if (body.phone && !body.phone.includes('{{')) {
      tech = await getTechnicianByPhone(env.DB, body.phone);
      if (!tech) {
        tech = await getTechnicianByPhoneFromST(env, body.phone);
      }
    }

    if (!tech && techName) {
      tech = await findTechByName(env.DB, techName);
    }

    if (!tech) {
      return jsonResponse({
        identified: false,
        phone: body.phone || null,
        name: body.name || null,
        message: "Technician not found. Ask the caller their name if you haven't already.",
        hint: 'Try calling identify_tech again with their full name in the "name" field.',
      });
    }

    const current_job = await findCurrentJob(env, String(tech.id));

    let dispatch_status: string | null = null;
    let next_job = null;
    try {
      const status = await env.DB.prepare(
        `SELECT * FROM tech_current_status WHERE technician_id = ?`
      ).bind(tech.id).first() as any;
      if (status) {
        dispatch_status = status.dispatch_status;
        if (status.next_job_id) {
          next_job = {
            job_id: status.next_job_id,
            customer_name: status.next_customer,
            location: status.next_address,
            start_time: status.next_start_time,
          };
        }
      }
    } catch { /* dispatch cache is optional */ }

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
    } catch { /* coaching profile is optional */ }

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
  } catch (err: any) {
    console.error('Identify tech handler error:', err);
    return jsonResponse({ error: 'Internal error', details: err.message }, 500);
  }
}
