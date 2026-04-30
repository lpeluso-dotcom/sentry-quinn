// =============================================================================
// capacity-lookup.ts — Retell capacity tool handler (sentry-quinn)
//
// OPEN-TASKS line ~127. Miss Dawn calls this when a customer asks for an
// arrival window, and Retell needs to know which slots are still bookable
// before offering one. The handler hits ST's dispatch capacity endpoint
// (POST /dispatch/v2/tenant/{id}/capacity), caches the response in CACHE
// (KV) for 5 minutes per (businessUnitId, arrivalWindow), and returns a
// canonical {available_slots, status} shape that the Retell flow expects.
//
// Why a 5-min TTL: capacity changes at the cadence of dispatch decisions
// (roughly minutes); 5 min is short enough to feel live, long enough to
// flatten the call-burst spikes that happen when Dawn asks the same
// question for several leads in a row.
//
// Inputs (extracted via Retell's args envelope):
//   business_unit_id  — number; required
//   arrival_window    — string; "YYYY-MM-DD HH:MM-HH:MM" or any tag the
//                       caller agreed on, used as a cache-key suffix and
//                       passed to ST as the request body
//
// Output (always 200; see retell.md "no 404 from tool handlers"):
//   { status: "ok",     available_slots: [{start,end}, ...] }
//   { status: "empty",  available_slots: [] }
//   { status: "error",  message: "..." }
// =============================================================================

import { Env } from '../index';
import { extractArgs } from '../utils/retell';
import { jsonResponse } from '../utils/db';
import { getSTToken } from '../utils/st-api';

const TENANT_ID = '431848990';
const CACHE_TTL_SECONDS = 300; // 5 minutes

interface CapacityRequestBody {
  business_unit_id?: number | string;
  arrival_window?: string;
}

interface CapacitySlot {
  start: string;
  end: string;
}

interface CapacityResponse {
  status: 'ok' | 'empty' | 'error';
  available_slots: CapacitySlot[];
  message?: string;
  cached?: boolean;
}

function cacheKey(businessUnitId: number | string, arrivalWindow: string): string {
  return `cap:${businessUnitId}:${arrivalWindow}`;
}

async function readCache(env: Env, key: string): Promise<CapacityResponse | null> {
  try {
    const raw = await env.CACHE.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CapacityResponse;
    parsed.cached = true;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(env: Env, key: string, value: CapacityResponse): Promise<void> {
  try {
    await env.CACHE.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
  } catch (err) {
    console.error('capacity cache write error:', err);
  }
}

async function fetchCapacityFromST(
  env: Env,
  businessUnitId: number,
  arrivalWindow: string,
): Promise<CapacityResponse> {
  const token = await getSTToken(env);
  const path = `/dispatch/v2/tenant/${TENANT_ID}/capacity`;
  const res = await fetch(`https://api.servicetitan.io${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'ST-App-Key': env.ST_APP_KEY ?? '',
    },
    body: JSON.stringify({
      businessUnitIds: [businessUnitId],
      arrivalWindow,
    }),
  });

  if (!res.ok) {
    return {
      status: 'error',
      available_slots: [],
      message: `ST capacity ${res.status}`,
    };
  }

  const data = (await res.json()) as { availabilities?: Array<{ start?: string; end?: string }> };
  const slots: CapacitySlot[] = (data.availabilities ?? [])
    .filter((s) => s.start && s.end)
    .map((s) => ({ start: s.start!, end: s.end! }));

  if (slots.length === 0) {
    return { status: 'empty', available_slots: [] };
  }
  return { status: 'ok', available_slots: slots };
}

export async function handleCapacityLookup(req: Request, env: Env): Promise<Response> {
  try {
    const rawBody = (await req.json()) as Record<string, any>;
    const body = extractArgs(rawBody) as CapacityRequestBody;

    const businessUnitId = Number(body.business_unit_id);
    const arrivalWindow = (body.arrival_window || '').trim();

    if (!businessUnitId || !arrivalWindow) {
      return jsonResponse({
        status: 'error',
        available_slots: [],
        message: 'business_unit_id and arrival_window are required',
      });
    }

    const key = cacheKey(businessUnitId, arrivalWindow);
    const cached = await readCache(env, key);
    if (cached) return jsonResponse(cached);

    const fresh = await fetchCapacityFromST(env, businessUnitId, arrivalWindow);
    if (fresh.status !== 'error') {
      await writeCache(env, key, fresh);
    }
    return jsonResponse(fresh);
  } catch (err) {
    console.error('capacity-lookup handler error:', err);
    return jsonResponse({
      status: 'error',
      available_slots: [],
      message: (err as Error).message ?? 'unknown error',
    });
  }
}
