import { Env } from '../index';
import { getTechnicianByPhone, getTechnicianById } from '../utils/db';
import { getTechnicianAppointments } from '../utils/st-api';

export async function handleAppointments(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as {
      technician_name?: string;
      technician_id?: string;
    };

    let techId = body.technician_id;

    // If name provided, look up tech by name (search D1 technicians table)
    if (!techId && body.technician_name) {
      const tech = await getTechnicianByPhone(env.DB, body.technician_name);
      if (tech) {
        techId = tech.id;
      }
    }

    if (!techId) {
      return new Response(
        JSON.stringify({
          error: 'Technician not found',
          details: 'Please provide technician_id or a name match in our system',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get appointments from ST API
    const appointments = await getTechnicianAppointments(env, techId);

    // Filter to today, status Scheduled or Dispatched
    const today = new Date().toISOString().split('T')[0];
    const todaysAppointments = appointments
      .filter(
        (apt: any) =>
          apt.startDateTime?.startsWith(today) &&
          ['Scheduled', 'Dispatched'].includes(apt.status)
      )
      .sort((a: any, b: any) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());

    return new Response(
      JSON.stringify({
        status: 'success',
        technician_id: techId,
        count: todaysAppointments.length,
        appointments: todaysAppointments.map((apt: any) => ({
          id: apt.id,
          customer_name: apt.customerName,
          job_id: apt.jobId,
          start_time: apt.startDateTime,
          end_time: apt.endDateTime,
          status: apt.status,
          address: apt.address,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Appointments handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
