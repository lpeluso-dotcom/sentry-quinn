import { Env } from '../index';
import { searchPricebook, jsonResponse } from '../utils/db';

export async function handlePricebook(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as Record<string, any>;
    console.log('[Pricebook] Raw body keys:', Object.keys(body), 'body:', JSON.stringify(body).substring(0, 500));

    // Accept multiple field names — Retell may send "name", "query", "search", or "item"
    const code = body.code as string | undefined;
    const searchTerm = body.query || body.search || body.item || body.name || body.description;

    // Filter out Retell metadata that might leak into search
    const cleanTerm = (searchTerm && typeof searchTerm === 'string' &&
      !searchTerm.includes('validate_pricebook') &&
      !searchTerm.includes('execution_message'))
      ? searchTerm : undefined;

    if (!code && !cleanTerm) {
      return jsonResponse({
        status: 'error',
        message: 'Please provide a search term. Example: {"query": "bidet"} or {"name": "water heater"}',
        received: body
      }, 200);
    }

    const items = await searchPricebook(env.DB, code, cleanTerm);
    console.log('[Pricebook] Found', items.length, 'items for', code || cleanTerm);

    if (!items.length) {
      return jsonResponse({
        status: 'not_found',
        message: `No pricebook items found matching "${code || cleanTerm}". Try a broader term or different spelling.`
      }, 200);
    }

    return jsonResponse({
      status: 'success',
      count: items.length,
      items: items.map(item => ({
        code: item.code,
        name: item.name,
        description: item.description || '',
        price: item.price || 0,
        member_price: item.member_price || null,
        category: item.category || '',
        type: item.type,
      })),
    });
  } catch (err) {
    console.error('Pricebook handler error:', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
}
