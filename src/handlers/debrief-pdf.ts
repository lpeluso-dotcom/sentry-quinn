import { Env } from '../index';
import { jsonResponse, normalizePhone } from '../utils/db';

const PHONE_TO_TECH: Record<string, string> = {
  '8542166525': 'Josh Bass',
  '8434726811': 'Clyde Padgett',
  '8434963573': 'Brooks Hunsucker',
  '8434095657': 'Unknown Plumber',
};

export async function handleDebriefPdf(request: Request, env: Env): Promise<Response> {
  try {
    const body: any = await request.json();
    const callId = body.call_id || body.args?.call_id;

    if (!callId) {
      return jsonResponse({ error: 'call_id required' }, 400);
    }

    // Fetch call data from D1
    const call = await env.DB.prepare(`
      SELECT call_id, customer_name, call_type, duration, created_at, direction,
             campaign_name, from_number, recording_url, transcript, business_unit,
             job_type, job_number, agent_name
      FROM calls WHERE call_id = ?
    `).bind(callId).first();

    if (!call) {
      return jsonResponse({ error: 'Call not found', call_id: callId }, 404);
    }

    // Fetch debrief if exists
    const debrief = await env.DB.prepare(`
      SELECT * FROM quinn_debriefs WHERE call_id = ? OR retell_call_id = ?
    `).bind(callId, String(callId)).first().catch(() => null);

    const phone = normalizePhone(String(call.from_number || ''));
    const techName = PHONE_TO_TECH[phone] || 'Unknown';

    // Format date
    const callDate = new Date(call.created_at as string);
    const dateStr = callDate.toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    // Duration in minutes
    const durMins = Math.round(Number(call.duration || 0) / 60);

    // Build PDF content sections
    const sections: { title: string; content: string }[] = [
      {
        title: 'CALL INFORMATION',
        content: [
          `Technician: ${techName}`,
          `Customer: ${call.customer_name || 'N/A'}`,
          `Date: ${dateStr}`,
          `Duration: ${durMins} minutes`,
          `Call Type: ${call.call_type}`,
          `Campaign: ${call.campaign_name || 'N/A'}`,
          `Job #: ${call.job_number || 'N/A'}`,
          `Business Unit: ${call.business_unit || 'N/A'}`,
        ].join('\n'),
      },
    ];

    // Add debrief data if available
    if (debrief) {
      sections.push({
        title: 'DEBRIEF SUMMARY',
        content: [
          `Job Complete: ${debrief.job_complete ? 'Yes' : 'No'}`,
          `Invoice Closed: ${debrief.invoice_closed ? 'Yes' : 'No'}`,
          `Parts Used: ${debrief.parts_used || 'N/A'}`,
          `Restock Needed: ${debrief.restock_needed || 'None'}`,
          `Follow-Up: ${debrief.follow_up_type || 'None'} ${debrief.follow_up_notes || ''}`,
          `Equipment Scanned: ${debrief.equipment_scanned ? 'Yes' : 'No'}`,
          `Property Notes: ${debrief.property_notes || 'None'}`,
          `Recommendations: ${debrief.recommendations_observed || 'None'}`,
          `Membership: ${debrief.membership_status || 'N/A'}`,
        ].join('\n'),
      });

      if (debrief.coaching_flags) {
        sections.push({
          title: 'COACHING FLAGS',
          content: String(debrief.coaching_flags).split(',').map((f: string) => `• ${f.trim()}`).join('\n'),
        });
      }

      if (debrief.escalation_flags) {
        sections.push({
          title: 'ESCALATION FLAGS',
          content: String(debrief.escalation_flags).split(',').map((f: string) => `⚠ ${f.trim()}`).join('\n'),
        });
      }
    }

    // Add transcript
    const transcript = String(call.transcript || '');
    if (transcript.length > 10) {
      sections.push({
        title: 'TRANSCRIPT',
        content: transcript,
      });
    }

    // Generate PDF bytes
    const pdfBytes = generatePdf(
      `QSC Debrief Report — ${techName}`,
      `Call #${callId} | ${dateStr}`,
      sections,
    );

    // Return as base64 for Make.com OneDrive upload
    const base64 = arrayBufferToBase64(pdfBytes);

    // Mark as PDF generated in KV (prevents duplicates)
    await env.STATE.put(`pdf:${callId}`, new Date().toISOString(), { expirationTtl: 86400 * 30 });

    return jsonResponse({
      status: 'ok',
      call_id: callId,
      technician: techName,
      customer_name: call.customer_name || 'N/A',
      date: dateStr,
      pdf_base64: base64,
      pdf_size: pdfBytes.byteLength,
      filename: `${callDate.toISOString().slice(0, 10)} - ${techName} - ${call.customer_name || 'Debrief'}.pdf`,
    });
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============================================================
// Minimal PDF generator — raw PDF 1.4 spec, no dependencies
// ============================================================

function generatePdf(title: string, subtitle: string, sections: { title: string; content: string }[]): ArrayBuffer {
  const enc = new TextEncoder();

  // Page dimensions (A4-ish: 612x792 points = US Letter)
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 50;
  const LINE_H = 14;
  const SECTION_GAP = 20;
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  // Break all text into pages of lines
  interface PageContent {
    lines: { text: string; fontSize: number; bold: boolean; y: number }[];
  }

  const pages: PageContent[] = [];
  let currentPage: PageContent = { lines: [] };
  let curY = PAGE_H - MARGIN - 30; // start below top margin

  function addLine(text: string, fontSize: number, bold: boolean, extraGap = 0) {
    const lineHeight = fontSize * 1.4;
    if (curY - lineHeight < MARGIN + 30) {
      // New page
      pages.push(currentPage);
      currentPage = { lines: [] };
      curY = PAGE_H - MARGIN - 20;
    }
    curY -= extraGap;
    currentPage.lines.push({ text: sanitizePdfText(text), fontSize, bold, y: curY });
    curY -= lineHeight;
  }

  // Title
  addLine(title, 16, true);
  addLine(subtitle, 10, false, 4);
  curY -= 10;

  // Sections
  for (const section of sections) {
    addLine(section.title, 12, true, SECTION_GAP);
    curY -= 4;

    // Word-wrap content
    const contentLines = section.content.split('\n');
    for (const line of contentLines) {
      // Rough word wrap at ~85 chars for 10pt font
      const wrapped = wordWrap(line, 90);
      for (const wl of wrapped) {
        addLine(wl, 10, false);
      }
    }
  }

  pages.push(currentPage);

  // Now build the PDF
  const objects: string[] = [];
  let objCount = 0;

  function addObj(content: string): number {
    objCount++;
    objects.push(`${objCount} 0 obj\n${content}\nendobj\n`);
    return objCount;
  }

  // Obj 1: Catalog
  addObj('<< /Type /Catalog /Pages 2 0 R >>');

  // Obj 2: Pages (placeholder — we'll fix the Kids array)
  const pagesObjIdx = 1; // index in objects array
  addObj('PLACEHOLDER');

  // Obj 3: Font - Helvetica
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  // Obj 4: Font - Helvetica-Bold
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  // Generate page objects
  const pageObjIds: number[] = [];

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];

    // Build content stream
    let stream = 'BT\n';

    for (const line of page.lines) {
      const font = line.bold ? '/F2' : '/F1';
      stream += `${font} ${line.fontSize} Tf\n`;
      stream += `${MARGIN} ${line.y} Td\n`;
      stream += `(${escapePdfString(line.text)}) Tj\n`;
      stream += `0 0 Td\n`; // reset position for next absolute positioning
    }

    // Footer
    stream += `/F1 8 Tf\n`;
    stream += `${MARGIN} 25 Td\n`;
    stream += `(Quality Service Company | ECHO Debrief Report | Page ${p + 1} of ${pages.length}) Tj\n`;
    stream += 'ET\n';

    // Header line
    stream += `0.086 0.169 0.976 RG\n`; // QSC blue (#1628F9)
    stream += `2 w\n`;
    stream += `${MARGIN} ${PAGE_H - MARGIN - 2} m ${PAGE_W - MARGIN} ${PAGE_H - MARGIN - 2} l S\n`;

    // Footer line
    stream += `0.7 0.7 0.7 RG\n`;
    stream += `0.5 w\n`;
    stream += `${MARGIN} 40 m ${PAGE_W - MARGIN} 40 l S\n`;

    const streamBytes = enc.encode(stream);

    // Content stream object
    const streamObjId = addObj(
      `<< /Length ${streamBytes.length} >>\nstream\n${stream}endstream`
    );

    // Page object
    const pageObjId = addObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Contents ${streamObjId} 0 R ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`
    );
    pageObjIds.push(pageObjId);
  }

  // Fix Pages object
  const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(' ');
  objects[pagesObjIdx] = `2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pages.length} >>\nendobj\n`;

  // Build final PDF
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objCount + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 0; i < objCount; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += 'trailer\n';
  pdf += `<< /Size ${objCount + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF\n';

  return enc.encode(pdf).buffer;
}

function wordWrap(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapePdfString(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\x00-\x1f]/g, '');
}

function sanitizePdfText(text: string): string {
  // Replace non-ASCII chars with ASCII equivalents
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\n\r\t]/g, '');
}
