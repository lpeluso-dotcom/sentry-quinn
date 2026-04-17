import { Env } from '../index';
import { jsonResponse, getTechnicianByPhone } from '../utils/db';

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as any;
    const { event, call_id } = body;

    console.log(`[Retell Webhook] Event: ${event}, Call ID: ${call_id}`);

    if (event === 'call_inbound') {
      return handleCallInbound(env, body);
    }

    if (event === 'call_ended') {
      await saveCallRecord(env, body, call_id);
    }

    if (event === 'call_analyzed') {
      await updateCallAnalytics(env, body, call_id);
    }

    return jsonResponse({ status: 'success', event, call_id });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}

async function handleCallInbound(env: Env, body: any): Promise<Response> {
  const fromNumber = body.call_inbound?.from_number || '';
  console.log(`[Inbound] from: ${fromNumber}`);

  const tech = await getTechnicianByPhone(env.DB, fromNumber);

  if (tech) {
    console.log(`[Inbound] Identified: ${tech.name} (${tech.id})`);
  } else {
    console.log(`[Inbound] Unknown caller: ${fromNumber}`);
  }

  return jsonResponse({
    dynamic_variables: {
      caller_name: tech?.name || '',
      caller_id: tech ? String(tech.id) : '',
      caller_phone: fromNumber,
      caller_identified: tech ? 'true' : 'false',
    },
  });
}

async function saveCallRecord(env: Env, body: any, callId: string): Promise<void> {
  console.log(`[CallEnded] ${callId}, duration: ${body.duration_ms || 0}ms`);
  const transcript =
    typeof body.transcript === 'string'
      ? body.transcript
      : body.transcript_object
      ? JSON.stringify(body.transcript_object)
      : '';
  try {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO retell_calls (
        call_id, agent_id, from_number, to_number, direction, duration_ms,
        call_category, trade_identified, appointment_booked, customer_sentiment,
        call_summary, transcript, started_at, ended_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      callId,
      body.agent_id || '',
      body.from_number || '',
      body.to_number || '',
      body.direction || 'inbound',
      body.duration_ms || 0,
      body.call_analysis?.call_summary ? 'debrief' : '',
      body.call_analysis?.custom_analysis_data?.trade || '',
      body.call_analysis?.custom_analysis_data?.appointment_booked ? 1 : 0,
      body.call_analysis?.user_sentiment || '',
      body.call_analysis?.call_summary || '',
      transcript,
      body.start_timestamp ? String(body.start_timestamp) : '',
      body.end_timestamp ? String(body.end_timestamp) : '',
    ).run();
    console.log(`[CallEnded] Saved to retell_calls`);
  } catch (dbErr) {
    console.error('[CallEnded] DB write failed:', dbErr);
  }
}

async function updateCallAnalytics(env: Env, body: any, callId: string): Promise<void> {
  console.log(`[CallAnalyzed] ${callId}`);
  const analysis = body.call_analysis || {};
  try {
    await env.DB.prepare(`
      UPDATE retell_calls SET
        call_category = COALESCE(NULLIF(?, ''), call_category),
        trade_identified = COALESCE(NULLIF(?, ''), trade_identified),
        customer_sentiment = COALESCE(NULLIF(?, ''), customer_sentiment)
      WHERE call_id = ?
    `).bind(
      analysis.call_summary ? 'debrief' : (analysis.custom_analysis_data?.category || ''),
      analysis.custom_analysis_data?.trade || '',
      analysis.user_sentiment || '',
      callId,
    ).run();
    console.log(`[CallAnalyzed] Updated analytics for ${callId}`);
  } catch (dbErr) {
    console.error('[CallAnalyzed] DB update failed:', dbErr);
  }
}
