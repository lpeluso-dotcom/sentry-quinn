import { jsonResponse } from '../utils/db';

export async function handleDigest(req: Request, env: any): Promise<Response> {
  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '1', 10);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    // Get debriefs in the time window
    const debriefs = await env.DB.prepare(
      `SELECT * FROM quinn_debriefs WHERE debrief_date >= ? ORDER BY created_at DESC`
    ).bind(cutoffStr).all();

    const rows = debriefs?.results || [];

    // Count coaching flags
    const coachingFlagCounts: Record<string, number> = {};
    let debriefsWithCoaching = 0;
    let debriefsWithEscalation = 0;

    for (const row of rows) {
      try {
        const flags = JSON.parse(row.coaching_flags || '[]');
        if (flags.length > 0) debriefsWithCoaching++;
        for (const flag of flags) {
          coachingFlagCounts[flag] = (coachingFlagCounts[flag] || 0) + 1;
        }
      } catch { /* ignore parse errors */ }

      try {
        const eFlags = JSON.parse(row.escalation_flags || '[]');
        if (eFlags.length > 0) debriefsWithEscalation++;
      } catch { /* ignore */ }
    }

    return jsonResponse({
      status: 'success',
      period: `Last ${days} day(s) (since ${cutoffStr})`,
      total_debriefs: rows.length,
      debriefs_with_coaching_flags: debriefsWithCoaching,
      debriefs_with_escalations: debriefsWithEscalation,
      coaching_flag_summary: coachingFlagCounts,
      debriefs: rows.map((r: any) => ({
        id: r.id,
        technician: r.technician,
        customer_name: r.customer_name,
        job_id: r.job_id,
        debrief_date: r.debrief_date,
        job_complete: !!r.job_complete,
        invoice_closed: !!r.invoice_closed,
        follow_up_type: r.follow_up_type,
        membership_status: r.membership_status,
        coaching_flags: r.coaching_flags,
        escalation_flags: r.escalation_flags,
      })),
    });
  } catch (err: any) {
    console.error('Digest handler error:', err);
    return jsonResponse({ error: 'Internal error', details: err.message }, 500);
  }
}
