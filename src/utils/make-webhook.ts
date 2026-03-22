import { Env } from '../index';

export async function fireTranscriptWebhook(
  env: Env,
  data: {
    retell_call_id: string;
    job_id: string;
    technician: string;
    customer_name: string;
    transcript?: string;
    coaching_flags?: string;
    escalation_flags?: string;
  }
): Promise<boolean> {
  try {
    const webhookUrl = env.MAKE_WEBHOOK_TRANSCRIPT;
    if (!webhookUrl) {
      console.warn('MAKE_WEBHOOK_TRANSCRIPT not configured');
      return false;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'quinn_debrief_complete',
        retell_call_id: data.retell_call_id,
        job_id: data.job_id,
        technician: data.technician,
        customer_name: data.customer_name,
        transcript: data.transcript || '',
        coaching_flags: data.coaching_flags || '[]',
        escalation_flags: data.escalation_flags || '[]',
        timestamp: new Date().toISOString(),
      }),
    });

    return response.ok;
  } catch (err) {
    console.error('Make.com transcript webhook error:', err);
    return false;
  }
}

export async function fireEscalationWebhook(
  env: Env,
  data: {
    retell_call_id: string;
    job_id: string;
    technician: string;
    escalation_flags: string;
    summary: string;
  }
): Promise<boolean> {
  try {
    const webhookUrl = env.MAKE_WEBHOOK_ESCALATE;
    if (!webhookUrl) {
      console.warn('MAKE_WEBHOOK_ESCALATE not configured');
      return false;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'quinn_escalation',
        retell_call_id: data.retell_call_id,
        job_id: data.job_id,
        technician: data.technician,
        escalation_flags: data.escalation_flags,
        summary: data.summary,
        timestamp: new Date().toISOString(),
      }),
    });

    return response.ok;
  } catch (err) {
    console.error('Make.com escalation webhook error:', err);
    return false;
  }
}
