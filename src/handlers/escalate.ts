import { Env } from '../index';
import { createSTTask } from '../utils/st-api';
import { fireEscalationWebhook } from '../utils/make-webhook';

export async function handleEscalate(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as {
      job_id?: string;
      technician?: string;
      escalation_flags: string | string[];
      summary: string;
      retell_call_id?: string;
    };

    if (!body.escalation_flags || !body.summary) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: escalation_flags, summary' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const flags = Array.isArray(body.escalation_flags) ? body.escalation_flags : [body.escalation_flags];

    // Create ST task
    const taskResult = await createSTTask(env, {
      name: `Miss Dawn Escalation: ${flags.join(', ')}`,
      description: `Escalation flags: ${flags.join(', ')}\n\nSummary: ${body.summary}\n\nJob: ${body.job_id || 'Unknown'}\nTech: ${body.technician || 'Unknown'}`,
      jobId: body.job_id,
      type: '78250217', // Dispatch/Scheduling
      source: '78247908', // CIC
      priority: 'high',
    });

    // Fire Make.com webhook
    const webhookResult = await fireEscalationWebhook(env, {
      retell_call_id: body.retell_call_id || '',
      job_id: body.job_id || '',
      technician: body.technician || '',
      escalation_flags: JSON.stringify(flags),
      summary: body.summary,
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        message: 'Escalation created',
        escalation_flags: flags,
        st_task_id: taskResult?.id || null,
        st_task_created: !!taskResult,
        webhook_sent: webhookResult,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Escalate handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
