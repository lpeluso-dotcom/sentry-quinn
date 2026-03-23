import { Env } from '../index';
import { searchPricebook, searchCustomers, jsonResponse } from '../utils/db';

export async function handleEquipment(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as {
      mode: string; customer_name?: string; customer_id?: string;
      query?: string; category?: string; brand?: string;
    };

    if (!body.mode) {
      return jsonResponse({ error: 'Missing required field: mode ("existing" or "new")' }, 400);
    }

    if (body.mode === 'existing') {
      // Look up installed equipment for a customer — requires ST API (not in D1)
      // For now, return a helpful message since installed equipment comes from live ST API
      return jsonResponse({
        status: 'not_available',
        message: 'Installed equipment lookup requires live ServiceTitan API. Use the customer name to look up their job history instead.',
      });
    }

    if (body.mode === 'new') {
      const searchTerm = body.query || body.category || body.brand || '';
      if (!searchTerm) {
        return jsonResponse({ error: 'Missing query, category, or brand for new equipment search' }, 400);
      }

      // Search pb_equipment first, then fall back to pb_services
      const results = await env.DB.prepare(
        `SELECT code, name, description, category_name as category, price, brand, manufacturer, 'equipment' as type
         FROM pb_equipment WHERE active = 1 AND (name LIKE ? OR description LIKE ? OR category_name LIKE ? OR brand LIKE ?)
         LIMIT 5`
      ).bind(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`).all();

      let items = results?.results || [];

      // Also check services (many "equipment" items are listed as services in ST)
      if (items.length < 3) {
        const svcResults = await searchPricebook(env.DB, undefined, searchTerm);
        items = [...items, ...svcResults].slice(0, 5);
      }

      if (!items.length) {
        return jsonResponse({ status: 'not_found', message: 'No equipment found matching that search' }, 200);
      }

      return jsonResponse({
        status: 'success',
        count: items.length,
        items: items.map((i: any) => ({
          code: i.code, name: i.name, description: i.description || '',
          price: i.price || 0, category: i.category || '', type: i.type || 'equipment',
        })),
      });
    }

    return jsonResponse({ error: 'Mode must be "existing" or "new"' }, 400);
  } catch (err) {
    console.error('Equipment handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
