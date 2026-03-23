export interface QuinnDebrief {
  id?: string;
  retell_call_id: string;
  job_id: string;
  customer_name: string;
  technician: string;
  technician_id?: string;
  debrief_date: string;
  job_complete: boolean;
  invoice_closed: boolean;
  parts_used?: string;
  restock_needed?: string;
  returns_needed?: string;
  follow_up_type?: string;
  follow_up_timing?: string;
  follow_up_notes?: string;
  equipment_scanned: boolean;
  equipment_missed?: string;
  property_notes?: string;
  recommendations_observed?: string;
  recommendations_presented: boolean;
  membership_status?: string;
  coaching_flags?: string;
  escalation_flags?: string;
  additional_notes?: string;
  created_at?: string;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

export function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function saveDebrief(db: D1Database, debrief: QuinnDebrief): Promise<void> {
  const {
    retell_call_id, job_id, customer_name, technician, technician_id,
    debrief_date, job_complete, invoice_closed, parts_used, restock_needed,
    returns_needed, follow_up_type, follow_up_timing, follow_up_notes,
    equipment_scanned, equipment_missed, property_notes,
    recommendations_observed, recommendations_presented, membership_status,
    coaching_flags, escalation_flags, additional_notes,
  } = debrief;

  await db.prepare(`
    INSERT INTO quinn_debriefs (
      retell_call_id, job_id, customer_name, technician, technician_id,
      debrief_date, job_complete, invoice_closed, parts_used, restock_needed,
      returns_needed, follow_up_type, follow_up_timing, follow_up_notes,
      equipment_scanned, equipment_missed, property_notes,
      recommendations_observed, recommendations_presented, membership_status,
      coaching_flags, escalation_flags, additional_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    retell_call_id, job_id, customer_name, technician, technician_id || null,
    debrief_date, job_complete ? 1 : 0, invoice_closed ? 1 : 0,
    parts_used || null, restock_needed || null, returns_needed || null,
    follow_up_type || null, follow_up_timing || null, follow_up_notes || null,
    equipment_scanned ? 1 : 0, equipment_missed || null, property_notes || null,
    recommendations_observed || null, recommendations_presented ? 1 : 0,
    membership_status || null, coaching_flags || null, escalation_flags || null,
    additional_notes || null
  ).run();
}

async function safeFirst(db: D1Database, sql: string, ...params: any[]): Promise<any> {
  try {
    return await db.prepare(sql).bind(...params).first() || null;
  } catch {
    return null;
  }
}

export async function getTechnicianByPhone(db: D1Database, phone: string): Promise<any> {
  const normalized = normalizePhone(phone);
  return safeFirst(db,
    `SELECT tech_id as id, name, email, phone FROM technicians
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '(', ''), ')', '') = ?
     AND active = 1 LIMIT 1`,
    normalized
  );
}

export function getTechnicianById(db: D1Database, id: string) {
  return safeFirst(db,
    `SELECT tech_id as id, name, email, phone FROM technicians WHERE tech_id = ? LIMIT 1`, id);
}

export function getCustomerById(db: D1Database, id: string) {
  return safeFirst(db,
    `SELECT customer_id as id, name, phone, email FROM customers WHERE customer_id = ? LIMIT 1`, id);
}

export function getJobById(db: D1Database, id: string) {
  return safeFirst(db,
    `SELECT j.job_id as id, j.customer_name, j.location, j.job_type, j.job_status,
            j.technician, j.scheduled_date, j.completed_date, j.revenue,
            jt.name as job_type_name
     FROM jobs j LEFT JOIN job_types jt ON j.job_type = jt.name
     WHERE j.job_id = ? LIMIT 1`, id);
}

export function getLocationById(db: D1Database, id: string) {
  return safeFirst(db,
    `SELECT location_id as id, name, address, city, state, zip, latitude, longitude
     FROM locations WHERE location_id = ? LIMIT 1`, id);
}

export function getInvoiceById(db: D1Database, id: string) {
  return safeFirst(db,
    `SELECT invoice_id as id, invoice_number, job_id, customer_name, total, balance,
            invoice_status, created_date, due_date
     FROM invoices WHERE invoice_id = ? LIMIT 1`, id);
}

export async function searchPricebook(db: D1Database, code?: string, name?: string): Promise<any[]> {
  try {
    if (code) {
      // Exact code match across all pb tables
      const svc = await safeFirst(db,
        `SELECT code, name, description, category_name as category, price, member_price, 'service' as type FROM pb_services WHERE code = ? LIMIT 1`, code);
      if (svc) return [svc];
      const mat = await safeFirst(db,
        `SELECT code, name, description, category_name as category, cost as price, 'material' as type FROM pb_materials WHERE code = ? LIMIT 1`, code);
      if (mat) return [mat];
      const equip = await safeFirst(db,
        `SELECT code, name, description, category_name as category, price, 'equipment' as type FROM pb_equipment WHERE code = ? LIMIT 1`, code);
      if (equip) return [equip];
      return [];
    }
    if (name) {
      // Search services first (most relevant for techs), then materials, then equipment
      const q = `%${name}%`;
      const services = await db.prepare(
        `SELECT code, name, description, category_name as category, price, member_price, 'service' as type
         FROM pb_services WHERE active = 1 AND (name LIKE ? OR description LIKE ? OR category_name LIKE ?)
         ORDER BY price DESC LIMIT 5`
      ).bind(q, q, q).all();

      const materials = await db.prepare(
        `SELECT code, name, description, category_name as category, cost as price, NULL as member_price, 'material' as type
         FROM pb_materials WHERE active = 1 AND (name LIKE ? OR description LIKE ? OR category_name LIKE ?)
         ORDER BY cost DESC LIMIT 3`
      ).bind(q, q, q).all();

      const equipment = await db.prepare(
        `SELECT code, name, description, category_name as category, price, member_price, 'equipment' as type
         FROM pb_equipment WHERE active = 1 AND (name LIKE ? OR description LIKE ? OR category_name LIKE ?)
         ORDER BY price DESC LIMIT 3`
      ).bind(q, q, q).all();

      const all = [
        ...(services?.results || []),
        ...(materials?.results || []),
        ...(equipment?.results || []),
      ];
      // Return top 8 by price descending
      return all.sort((a: any, b: any) => (b.price || 0) - (a.price || 0)).slice(0, 8);
    }
    return [];
  } catch {
    return [];
  }
}

export async function searchCustomers(db: D1Database, query: string): Promise<any[]> {
  try {
    const normalized = normalizePhone(query);
    // Try phone match first if query looks like a number
    if (normalized.length >= 7) {
      const results = await db.prepare(
        `SELECT customer_id as id, name, phone, email, address, city, state, zip
         FROM customers WHERE phone LIKE ? LIMIT 5`
      ).bind(`%${normalized}%`).all();
      if (results?.results?.length) return results.results;
    }

    // Strip punctuation for matching (Victor's → Victors, O'Brien → OBrien)
    const clean = query.replace(/[''`.,!?]/g, '');

    // Try exact phrase match first (with and without punctuation)
    const exact = await db.prepare(
      `SELECT customer_id as id, name, phone, email, address, city, state, zip
       FROM customers WHERE name LIKE ? OR name LIKE ? OR address LIKE ? OR address LIKE ? LIMIT 5`
    ).bind(`%${query}%`, `%${clean}%`, `%${query}%`, `%${clean}%`).all();
    if (exact?.results?.length) return exact.results;

    // Fuzzy: split into words, strip punctuation, match each word individually
    // "Victor's Restaurant" → ["Victor", "Restaurant"] → matches "Victors " in DB
    const words = clean.split(/\s+/).filter(w => w.length >= 3);
    if (words.length > 0) {
      const conditions = words.map(() => 'LOWER(name) LIKE LOWER(?)').join(' OR ');
      const params = words.map(w => `%${w}%`);
      const fuzzy = await db.prepare(
        `SELECT customer_id as id, name, phone, email, address, city, state, zip
         FROM customers WHERE ${conditions} ORDER BY name LIMIT 5`
      ).bind(...params).all();
      return fuzzy?.results || [];
    }

    return [];
  } catch {
    return [];
  }
}

export async function searchInvoices(db: D1Database, opts: { job_id?: string; customer_name?: string; invoice_number?: string }): Promise<any[]> {
  try {
    if (opts.invoice_number) {
      const r = await safeFirst(db,
        `SELECT invoice_id as id, invoice_number, job_id, customer_name, total, balance, invoice_status, created_date
         FROM invoices WHERE invoice_number = ? LIMIT 1`, opts.invoice_number);
      return r ? [r] : [];
    }
    if (opts.job_id) {
      const results = await db.prepare(
        `SELECT invoice_id as id, invoice_number, job_id, customer_name, total, balance, invoice_status, created_date
         FROM invoices WHERE job_id = ? ORDER BY created_date DESC LIMIT 5`
      ).bind(opts.job_id).all();
      return results?.results || [];
    }
    if (opts.customer_name) {
      const results = await db.prepare(
        `SELECT invoice_id as id, invoice_number, job_id, customer_name, total, balance, invoice_status, created_date
         FROM invoices WHERE customer_name LIKE ? ORDER BY created_date DESC LIMIT 5`
      ).bind(`%${opts.customer_name}%`).all();
      return results?.results || [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function searchEstimates(db: D1Database, opts: { job_id?: string; customer_name?: string; estimate_id?: string }): Promise<any[]> {
  try {
    if (opts.estimate_id) {
      const r = await safeFirst(db,
        `SELECT estimate_id as id, job_id, customer_name, status, summary, total, items_json, created_date
         FROM estimates WHERE estimate_id = ? LIMIT 1`, opts.estimate_id);
      return r ? [r] : [];
    }
    if (opts.job_id) {
      const results = await db.prepare(
        `SELECT estimate_id as id, job_id, customer_name, status, summary, total, items_json, created_date
         FROM estimates WHERE job_id = ? ORDER BY created_date DESC LIMIT 5`
      ).bind(opts.job_id).all();
      return results?.results || [];
    }
    if (opts.customer_name) {
      const results = await db.prepare(
        `SELECT estimate_id as id, job_id, customer_name, status, summary, total, items_json, created_date
         FROM estimates WHERE customer_name LIKE ? ORDER BY created_date DESC LIMIT 5`
      ).bind(`%${opts.customer_name}%`).all();
      return results?.results || [];
    }
    return [];
  } catch {
    return [];
  }
}
