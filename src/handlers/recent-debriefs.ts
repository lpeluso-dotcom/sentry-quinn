import { Env } from '../index';

// Returns recent debrief calls from D1 — replaces broken ST native Make.com module
export async function handleRecentDebriefs(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const minutes = parseInt(url.searchParams.get('minutes') || '20');
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    // Luke's test phones to exclude
    const testPhones = ['8458033237', '8436243731'];

    const calls = await env.DB.prepare(`
      SELECT call_id, customer_name, call_type, duration, created_at, direction,
             campaign_name, from_number, business_unit, job_type, job_number,
             CASE WHEN transcript IS NOT NULL AND length(transcript) > 50 THEN 1 ELSE 0 END as has_transcript
      FROM calls
      WHERE campaign_name LIKE '%Debrief%'
        AND CAST(duration AS REAL) > 30
        AND created_at >= ?
      ORDER BY created_at DESC
    `).bind(since).all();

    // Filter out test calls
    const filtered = (calls.results || []).filter((c: any) => {
      const phone = String(c.from_number || '').replace(/\D/g, '').slice(-10);
      return !testPhones.includes(phone);
    });

    // Check which ones already have PDFs generated (via KV flag)
    const withPdfStatus = await Promise.all(filtered.map(async (c: any) => {
      const pdfFlag = await env.STATE.get(`pdf:${c.call_id}`);
      return { ...c, pdf_generated: !!pdfFlag };
    }));

    return new Response(JSON.stringify({
      status: 'ok',
      since,
      total: withPdfStatus.length,
      calls: withPdfStatus,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
