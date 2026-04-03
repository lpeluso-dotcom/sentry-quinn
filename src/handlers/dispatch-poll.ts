import { Env } from '../index';
import { stGet, getJobFromST, getLocationFromST, getCustomerFromST } from '../utils/st-api';
import { jsonResponse } from '../utils/db';

const TENANT_ID = '431848990';

interface Assignment {
  id: number;
  technicianId: number;
  technicianName: string;
  status: string;
  jobId: number;
  appointmentId: number;
  assignedOn: string;
  modifiedOn: string;
  isPaused: boolean;
  active: boolean;
}

interface Appointment {
  id: number;
  jobId: number;
  status: string;
  start: string;
  end: string;
  customerId: number;
}

/**
 * Poll ST Dispatch API and update tech_current_status in D1.
 * Call via: POST /api/admin/poll-dispatch with x-admin-key header.
 *
 * Logic per tech:
 *   1. Get today's appointments (filtered by technicianId)
 *   2. Get assignment status for each appointment's job
 *   3. Priority: Working > Dispatched > nearest Scheduled = current job
 *   4. Enrich with customer name + address from D1 (fast) or ST API (fallback)
 *   5. Upsert into tech_current_status
 */
export async function handleDispatchPoll(req: Request, env: Env): Promise<Response> {
  // Auth check
  const adminKey = req.headers.get('x-admin-key');
  if (adminKey !== 'quinn-sync-2026') {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Get all active technicians from D1
    const techs = await env.DB.prepare(
      `SELECT tech_id, name FROM technicians WHERE active = 1`
    ).all();

    const techList = (techs.results || []) as { tech_id: number; name: string }[];
    console.log(`Polling dispatch for ${techList.length} active techs`);

    let updated = 0;
    const results: any[] = [];

    for (const tech of techList) {
      try {
        const status = await pollTechStatus(env, tech.tech_id, tech.name, today);
        if (status) {
          await upsertStatus(env, status);
          updated++;
          results.push({ tech: tech.name, status: status.dispatch_status, job: status.current_job_number });
        }
      } catch (err) {
        console.error(`Poll error for ${tech.name}:`, err);
      }
    }

    return jsonResponse({
      status: 'ok',
      techs_polled: techList.length,
      techs_updated: updated,
      results,
      polled_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Dispatch poll error:', err);
    return jsonResponse({ error: 'Poll failed', details: (err as Error).message }, 500);
  }
}

async function pollTechStatus(env: Env, techId: number, techName: string, today: string) {
  // Step 1: Get tech's today appointments
  const apptData = await stGet(env,
    `/jpm/v2/tenant/${TENANT_ID}/appointments?technicianId=${techId}&startsOnOrAfter=${today}T00:00:00Z&startsOnOrBefore=${today}T23:59:59Z&pageSize=50`
  );

  const appointments: Appointment[] = apptData?.data || [];
  if (appointments.length === 0) {
    return {
      technician_id: techId,
      technician_name: techName,
      dispatch_status: 'Off',
      current_job_id: null,
      current_job_number: null,
      current_customer: null,
      current_address: null,
      current_job_type: null,
      current_appointment_id: null,
      current_appointment_start: null,
      current_appointment_end: null,
      next_job_id: null,
      next_job_number: null,
      next_customer: null,
      next_address: null,
      next_start_time: null,
    };
  }

  // Step 2: Get assignment statuses for each appointment's job
  let working: { assignment: Assignment; appointment: Appointment } | null = null;
  let dispatched: { assignment: Assignment; appointment: Appointment } | null = null;
  let nextScheduled: { assignment: Assignment; appointment: Appointment } | null = null;
  const doneJobs: number[] = [];

  for (const appt of appointments) {
    try {
      const assignData = await stGet(env,
        `/dispatch/v2/tenant/${TENANT_ID}/appointment-assignments?jobId=${appt.jobId}`
      );

      const assignments: Assignment[] = (assignData?.data || []).filter(
        (a: Assignment) => a.technicianId === techId
      );

      for (const a of assignments) {
        if (a.status === 'Working') {
          working = { assignment: a, appointment: appt };
        } else if (a.status === 'Dispatched' && !dispatched) {
          dispatched = { assignment: a, appointment: appt };
        } else if (a.status === 'Scheduled' && appt.status !== 'Done') {
          if (!nextScheduled || new Date(appt.start) < new Date(nextScheduled.appointment.start)) {
            nextScheduled = { assignment: a, appointment: appt };
          }
        } else if (a.status === 'Done') {
          doneJobs.push(appt.jobId);
        }
      }
    } catch (err) {
      console.error(`Assignment lookup error for job ${appt.jobId}:`, err);
    }
  }

  // Step 3: Priority resolution
  const current = working || dispatched || null;
  let dispatchStatus: string;
  if (working) {
    dispatchStatus = 'Working';
  } else if (dispatched) {
    dispatchStatus = 'Dispatched';
  } else if (nextScheduled) {
    dispatchStatus = 'Scheduled';
  } else {
    dispatchStatus = 'Done';
  }

  // Step 4: Enrich current job
  let currentJob: any = null;
  let currentCustomer: string | null = null;
  let currentAddress: string | null = null;
  let currentJobType: string | null = null;

  if (current) {
    currentJob = await enrichJob(env, current.appointment.jobId, current.appointment.customerId);
    currentCustomer = currentJob?.customerName;
    currentAddress = currentJob?.address;
    currentJobType = currentJob?.jobType;
  }

  // Step 5: Enrich next job (and fall back to nextScheduled for current if no working/dispatched)
  let nextCustomer: string | null = null;
  let nextAddress: string | null = null;

  if (nextScheduled && nextScheduled !== current) {
    const nextJob = await enrichJob(env, nextScheduled.appointment.jobId, nextScheduled.appointment.customerId);
    nextCustomer = nextJob?.customerName;
    nextAddress = nextJob?.address;
  }

  // When no working/dispatched job, fall back to nextScheduled for current fields
  const effectiveCurrent = current || nextScheduled;

  // If we had no currentCustomer but fell back to nextScheduled, enrich it
  if (!currentCustomer && !current && nextScheduled) {
    const fallbackJob = await enrichJob(env, nextScheduled.appointment.jobId, nextScheduled.appointment.customerId);
    currentCustomer = fallbackJob?.customerName || null;
  }

  return {
    technician_id: techId,
    technician_name: techName,
    dispatch_status: dispatchStatus,
    current_job_id: effectiveCurrent?.appointment.jobId || null,
    current_job_number: effectiveCurrent ? String(effectiveCurrent.appointment.jobId) : '',
    current_customer: currentCustomer,
    current_address: currentAddress,
    current_job_type: currentJobType,
    current_appointment_id: effectiveCurrent?.appointment.id || null,
    current_appointment_start: effectiveCurrent?.appointment.start || null,
    current_appointment_end: effectiveCurrent?.appointment.end || null,
    next_job_id: nextScheduled?.appointment.jobId || null,
    next_job_number: nextScheduled ? String(nextScheduled.appointment.jobId) : null,
    next_customer: nextCustomer,
    next_address: nextAddress,
    next_start_time: nextScheduled?.appointment.start || null,
  };
}

async function enrichJob(env: Env, jobId: number, customerId: number) {
  // Try D1 first (fast)
  const d1Job = await env.DB.prepare(
    `SELECT j.job_id, j.customer_name, j.job_type, j.business_unit, l.address
     FROM jobs j LEFT JOIN locations l ON j.location_id = l.location_id
     WHERE j.job_id = ?`
  ).bind(jobId).first() as any;

  if (d1Job?.customer_name) {
    return {
      customerName: d1Job.customer_name,
      address: d1Job.address,
      jobType: d1Job.job_type,
    };
  }

  // Fallback: ST API
  try {
    const [job, customer] = await Promise.all([
      getJobFromST(env, String(jobId)),
      getCustomerFromST(env, String(customerId)),
    ]);

    const locationId = job?.locationId;
    let address = null;
    if (locationId) {
      const loc = await getLocationFromST(env, String(locationId));
      address = loc ? `${loc.address?.street || ''}, ${loc.address?.city || ''}`.trim() : null;
    }

    return {
      customerName: customer?.name || `Customer ${customerId}`,
      address,
      jobType: null, // Would need job_types lookup
    };
  } catch {
    return { customerName: `Customer ${customerId}`, address: null, jobType: null };
  }
}

async function upsertStatus(env: Env, s: any) {
  await env.DB.prepare(`
    INSERT OR REPLACE INTO tech_current_status
      (technician_id, technician_name, dispatch_status,
       current_job_id, current_job_number, current_customer, current_address, current_job_type,
       current_appointment_id, current_appointment_start, current_appointment_end,
       next_job_id, next_job_number, next_customer, next_address, next_start_time,
       last_polled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    s.technician_id, s.technician_name, s.dispatch_status,
    s.current_job_id, s.current_job_number, s.current_customer, s.current_address, s.current_job_type,
    s.current_appointment_id, s.current_appointment_start, s.current_appointment_end,
    s.next_job_id, s.next_job_number, s.next_customer, s.next_address, s.next_start_time,
  ).run();
}
