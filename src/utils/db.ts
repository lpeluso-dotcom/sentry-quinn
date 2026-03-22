export interface QuinnDebrief {
  id?: string;
  retell_call_id: string;
  job_id: string;
  customer_name: string;
  technician: string;
  technician_id?: string;
  date: string;
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

export async function saveDebrief(db: D1Database, debrief: QuinnDebrief): Promise<void> {
  const {
    retell_call_id,
    job_id,
    customer_name,
    technician,
    technician_id,
    date,
    job_complete,
    invoice_closed,
    parts_used,
    restock_needed,
    returns_needed,
    follow_up_type,
    follow_up_timing,
    follow_up_notes,
    equipment_scanned,
    equipment_missed,
    property_notes,
    recommendations_observed,
    recommendations_presented,
    membership_status,
    coaching_flags,
    escalation_flags,
    additional_notes,
  } = debrief;

  const stmt = db.prepare(`
    INSERT INTO quinn_debriefs (
      retell_call_id, job_id, customer_name, technician, technician_id,
      date, job_complete, invoice_closed, parts_used, restock_needed,
      returns_needed, follow_up_type, follow_up_timing, follow_up_notes,
      equipment_scanned, equipment_missed, property_notes,
      recommendations_observed, recommendations_presented, membership_status,
      coaching_flags, escalation_flags, additional_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  await stmt.bind(
    retell_call_id,
    job_id,
    customer_name,
    technician,
    technician_id || null,
    date,
    job_complete ? 1 : 0,
    invoice_closed ? 1 : 0,
    parts_used || null,
    restock_needed || null,
    returns_needed || null,
    follow_up_type || null,
    follow_up_timing || null,
    follow_up_notes || null,
    equipment_scanned ? 1 : 0,
    equipment_missed || null,
    property_notes || null,
    recommendations_observed || null,
    recommendations_presented ? 1 : 0,
    membership_status || null,
    coaching_flags || null,
    escalation_flags || null,
    additional_notes || null
  ).run();
}

export async function getTechnicianByPhone(db: D1Database, phone: string): Promise<any> {
  const normalized = normalizePhone(phone);
  const stmt = db.prepare(`
    SELECT id, name, email, phone FROM technicians
    WHERE REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '(', '') = ?
    LIMIT 1
  `);
  const result = await stmt.bind(normalized).first();
  return result || null;
}

export async function getTechnicianById(db: D1Database, id: string): Promise<any> {
  const stmt = db.prepare(`SELECT id, name, email, phone FROM technicians WHERE id = ? LIMIT 1`);
  return await stmt.bind(id).first();
}

export async function getCustomerById(db: D1Database, id: string): Promise<any> {
  const stmt = db.prepare(`
    SELECT id, name, phone, email FROM customers WHERE id = ? LIMIT 1
  `);
  return await stmt.bind(id).first();
}

export async function getJobById(db: D1Database, id: string): Promise<any> {
  const stmt = db.prepare(`
    SELECT j.*, c.name as customer_name, bt.name as business_unit_name, jt.name as job_type_name
    FROM jobs j
    LEFT JOIN customers c ON j.customer_id = c.id
    LEFT JOIN business_units bt ON j.business_unit_id = bt.id
    LEFT JOIN job_types jt ON j.job_type_id = jt.id
    WHERE j.id = ? LIMIT 1
  `);
  return await stmt.bind(id).first();
}

export async function getLocationById(db: D1Database, id: string): Promise<any> {
  const stmt = db.prepare(`
    SELECT id, name, address, city, state, zip, access_notes, latitude, longitude
    FROM locations WHERE id = ? LIMIT 1
  `);
  return await stmt.bind(id).first();
}

export async function getInvoiceById(db: D1Database, id: string): Promise<any> {
  const stmt = db.prepare(`
    SELECT * FROM invoices WHERE id = ? LIMIT 1
  `);
  return await stmt.bind(id).first();
}

export async function getPricebookItem(db: D1Database, code?: string, name?: string): Promise<any> {
  if (code) {
    const stmt = db.prepare(`
      SELECT * FROM pricebook WHERE code = ? LIMIT 1
    `);
    return await stmt.bind(code).first();
  }
  if (name) {
    const stmt = db.prepare(`
      SELECT * FROM pricebook WHERE name LIKE ? LIMIT 5
    `);
    const results = await stmt.bind(`%${name}%`).all();
    return results?.results?.[0] || null;
  }
  return null;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}
