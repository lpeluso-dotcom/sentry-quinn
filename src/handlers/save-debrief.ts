import { extractArgs } from '../utils/retell';
import { Env } from '../index';
import { jsonResponse, saveDebrief, QuinnDebrief } from '../utils/db';
import { fireTranscriptWebhook } from '../utils/make-webhook';

function maybeStringify(value: any): string | undefined {
  return value ? JSON.stringify(value) : undefined;
}

export async function handleSaveDebrief(req: Request, env: Env): Promise<Response> {
  try {
    const rawBody = (await req.json()) as Record<string, any>;
    const body = extractArgs(rawBody) as any;

    if (!body.technician) {
      return jsonResponse({ error: 'Missing required field: technician' }, 400);
    }

    console.log('[SaveDebrief] technician:', body.technician, '| job_id:', body.job_id || 'none', '| keys:', Object.keys(body).join(','));

    const debrief: QuinnDebrief = {
      retell_call_id: body.retell_call_id || '',
      job_id: body.job_id || '',
      customer_name: body.customer_name || '',
      technician: body.technician,
      technician_id: body.technician_id,
      debrief_date: body.date || new Date().toISOString().split('T')[0],
      job_complete: body.job_complete || false,
      invoice_closed: body.invoice_closed || false,
      parts_used: maybeStringify(body.parts_used),
      restock_needed: maybeStringify(body.restock_needed),
      returns_needed: maybeStringify(body.returns_needed),
      follow_up_type: body.follow_up_type,
      follow_up_timing: body.follow_up_timing,
      follow_up_notes: body.follow_up_notes,
      equipment_scanned: body.equipment_scanned || false,
      equipment_missed: maybeStringify(body.equipment_missed),
      property_notes: body.property_notes,
      recommendations_observed: maybeStringify(body.recommendations_observed),
      recommendations_presented: body.recommendations_presented || false,
      membership_status: body.membership_status,
      coaching_flags: body.coaching_flags ? JSON.stringify(body.coaching_flags) : '[]',
      escalation_flags: body.escalation_flags ? JSON.stringify(body.escalation_flags) : '[]',
      additional_notes: body.additional_notes,
    };

    await saveDebrief(env.DB, debrief);

    const webhookResult = await fireTranscriptWebhook(env, {
      retell_call_id: debrief.retell_call_id,
      job_id: debrief.job_id,
      technician: debrief.technician,
      customer_name: debrief.customer_name,
      transcript: body.transcript || '',
      coaching_flags: debrief.coaching_flags,
      escalation_flags: debrief.escalation_flags,
    });

    return jsonResponse({
      status: 'success',
      message: 'Debrief saved and webhook fired',
      job_id: body.job_id,
      technician: body.technician,
      webhook_sent: webhookResult,
    }, 201);
  } catch (err) {
    console.error('Save debrief handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
