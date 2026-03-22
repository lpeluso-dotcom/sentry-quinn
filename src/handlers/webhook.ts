import { Env } from '../index';

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as {
      event: string;
      call_id?: string;
      agent_id?: string;
      from_number?: string;
      to_number?: string;
      call_started_at?: string;
      call_ended_at?: string;
      recording_url?: string;
      transcript?: string;
      post_call_analysis?: any;
    };

    const { event, call_id } = body;

    console.log(`[Retell Webhook] Event: ${event}, Call ID: ${call_id}`);

    switch (event) {
      case 'call_started':
        // Log call start
        console.log(`Call started: ${call_id}`);
        break;

      case 'call_ended':
        // Call ended — may store call metadata later
        console.log(`Call ended: ${call_id}`);
        break;

      case 'call_analyzed':
        // Call has been analyzed by Retell
        console.log(`Call analyzed: ${call_id}`);
        if (body.post_call_analysis) {
          console.log('Analysis:', JSON.stringify(body.post_call_analysis));
        }
        break;

      default:
        console.log(`Unknown event: ${event}`);
    }

    // Always return 200 to acknowledge receipt
    return new Response(
      JSON.stringify({ status: 'success', event: event, call_id: call_id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
