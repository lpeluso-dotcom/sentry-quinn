import { extractArgs } from '../utils/retell';
import { Env } from '../index';
import { saveDebrief, QuinnDebrief } from '../utils/db';
import { fireTranscriptWebhook } from '../utils/make-webhook';

export async function handleSaveDebrief(req: Request, env: Env): Promise<Response> {
  try {
    const rawBody = (await req.json()) as Record<string, any>;
    const body = extractArgs(rawBody) as any;

    if (!body.job_id || !body.technician) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: job_id, technician' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const debrief: QuinnDebrief = {
      retell_call_id: body.retell_call_id || '',
      job_id: body.job_id,
      customer_name: body.customer_name || '',
      technician: body.technician,
      technician_id: body.technician_id,
      debrief_date: body.date || new Date().toISOString().split('T')[0],
      job_complete: body.job_complete || false,
      invoice_closed: body.invoice_closed || false,
      parts_used: body.parts_used ? JSON.stringify(body.parts_used) : undefined,
      restock_needed: body.restock_needed ? JSON.stringify(body.restock_needed) : undefined,
      returns_needed: body.returns_needed ? JSON.stringify(body.returns_needed) : undefined,
      follow_up_type: body.follow_up_type,
      follow_up_timing: body.follow_up_timing,
      follow_up_notes: body.follow_up_notes,
      equipment_scanned: body.equipment_scanned || false,
      equipment_missed: body.equipment_missed ? JSON.stringify(body.equipment_missed) : undefined,
      property_notes: body.property_notes,
      recommendations_observed: body.recommendations_observed ? JSON.stringify(body.recommendations_observed) : undefined,
      recommendations_presented: body.recommendations_presented || false,
      membership_status: body.membership_status,
      coaching_flags: body.coaching_flags ? JSON.stringify(body.coaching_flags) : '[]',
      escalation_flags: body.escalation_flags ? JSON.stringify(body.escalation_flags) : '[]',
      additional_notes: body.additional_notes,
    };

    // Save to D1
    await saveDebrief(env.DB, debrief);

    // Fire Make.com webhook for transcript
    const webhookResult = await fireTranscriptWebhook(env, {
      retell_call_id: debrief.retell_call_id,
      job_id: debrief.job_id,
      technician: debrief.technician,
      customer_name: debrief.customer_name,
      transcript: body.transcript || '',
      coaching_flags: debrief.coaching_flags,
      escalation_flags: debrief.escalation_flags,
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        message: 'Debrief saved and webhook fired',
        job_id: body.job_id,
        technician: body.technician,
        webhook_sent: webhookResult,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Save debrief handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
