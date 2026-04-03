import { Env } from '../index';
import { getTechnicianByPhone } from '../utils/db';

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as any;
    const { event, call_id } = body;

    console.log(`[Retell Webhook] Event: ${event}, Call ID: ${call_id}`);

    // INBOUND CALL — look up tech by phone BEFORE conversation starts
    if (event === 'call_inbound') {
      const fromNumber = body.call_inbound?.from_number || '';
      console.log(`[Inbound] from: ${fromNumber}`);

      const tech = await getTechnicianByPhone(env.DB, fromNumber);

      if (tech) {
        console.log(`[Inbound] Identified: ${tech.name} (${tech.id})`);
        return json({
          dynamic_variables: {
            caller_name: tech.name,
            caller_id: String(tech.id),
            caller_phone: fromNumber,
            caller_identified: 'true',
          },
        });
      } else {
        console.log(`[Inbound] Unknown caller: ${fromNumber}`);
        return json({
          dynamic_variables: {
            caller_name: '',
            caller_id: '',
            caller_phone: fromNumber,
            caller_identified: 'false',
          },
        });
      }
    }

    // CALL ENDED — save call record to retell_calls with analytics
    if (event === 'call_ended') {
      console.log(`[CallEnded] ${call_id}, duration: ${body.duration_ms || 0}ms`);
      try {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO retell_calls (
            retell_call_id, caller_phone, caller_name, caller_id,
            call_duration_ms, call_status, disconnect_reason,
            call_category, trade_identified, customer_sentiment,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          call_id,
          body.from_number || '',
          body.metadata?.caller_name || body.retell_llm_dynamic_variables?.caller_name || '',
          body.metadata?.caller_id || body.retell_llm_dynamic_variables?.caller_id || '',
          body.duration_ms || 0,
          body.call_status || 'completed',
          body.disconnect_reason || '',
          body.call_analysis?.call_summary ? 'debrief' : '',
          body.call_analysis?.custom_analysis_data?.trade || '',
          body.call_analysis?.user_sentiment || '',
        ).run();
        console.log(`[CallEnded] Saved to retell_calls`);
      } catch (dbErr) {
        console.error('[CallEnded] DB write failed:', dbErr);
      }
    }

    // CALL ANALYZED — update analytics fields after Retell analysis completes
    if (event === 'call_analyzed') {
      console.log(`[CallAnalyzed] ${call_id}`);
      const analysis = body.call_analysis || {};
      try {
        await env.DB.prepare(`
          UPDATE retell_calls SET
            call_category = COALESCE(NULLIF(?, ''), call_category),
            trade_identified = COALESCE(NULLIF(?, ''), trade_identified),
            customer_sentiment = COALESCE(NULLIF(?, ''), customer_sentiment)
          WHERE retell_call_id = ?
        `).bind(
          analysis.call_summary ? 'debrief' : (analysis.custom_analysis_data?.category || ''),
          analysis.custom_analysis_data?.trade || '',
          analysis.user_sentiment || '',
          call_id,
        ).run();
        console.log(`[CallAnalyzed] Updated analytics for ${call_id}`);
      } catch (dbErr) {
        console.error('[CallAnalyzed] DB update failed:', dbErr);
      }
    }

    return json({ status: 'success', event, call_id });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function json(data: any): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
