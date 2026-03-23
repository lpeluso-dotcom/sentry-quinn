import { Env } from '../index';
import { searchPricebook, jsonResponse } from '../utils/db';

export async function handlePricebook(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as { code?: string; name?: string };
    if (!body.code && !body.name) {
      return jsonResponse({ error: 'Missing code or name' }, 400);
    }

    const items = await searchPricebook(env.DB, body.code, body.name);
    if (!items.length) {
      return jsonResponse({ status: 'not_found', message: 'Item not found in pricebook' }, 200);
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
