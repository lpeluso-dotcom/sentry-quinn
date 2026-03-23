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

      // Look up tech by phone
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

    // Other lifecycle events
    switch (event) {
      case 'call_started':
        console.log(`Call started: ${call_id}`);
        break;
      case 'call_ended':
        console.log(`Call ended: ${call_id}`);
        break;
      case 'call_analyzed':
        console.log(`Call analyzed: ${call_id}`);
        if (body.post_call_analysis) {
          console.log('Analysis:', JSON.stringify(body.post_call_analysis));
        }
        break;
      default:
        console.log(`Unknown event: ${event}`);
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
