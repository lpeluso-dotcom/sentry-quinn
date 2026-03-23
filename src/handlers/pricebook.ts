import { Env } from '../index';
import { searchPricebook, jsonResponse } from '../utils/db';

import { extractArgs } from '../utils/retell';

export async function handlePricebook(req: Request, env: Env): Promise<Response> {
  try {
    const rawBody = (await req.json()) as Record<string, any>;
    const args = extractArgs(rawBody);

    console.log('[Pricebook] Raw keys:', Object.keys(rawBody).join(','), '| Args keys:', Object.keys(args).join(','));

    // Accept multiple field names for the search term
    const code = args.code as string | undefined;
    const searchTerm = args.query || args.search || args.item || args.name || args.description;

    // Filter out Retell internal values
    const cleanTerm = (searchTerm && typeof searchTerm === 'string' &&
      searchTerm.length < 100 &&
      !searchTerm.includes('validate_pricebook') &&
      !searchTerm.includes('execution_message') &&
      !searchTerm.includes('call_id'))
      ? searchTerm.trim() : undefined;

    if (!code && !cleanTerm) {
      return jsonResponse({
        status: 'not_found',
        message: 'No search term provided. Tell me what you need and I\'ll look it up.',
      }, 200);
    }

    const items = await searchPricebook(env.DB, code, cleanTerm);

    if (!items.length) {
      return jsonResponse({
        status: 'not_found',
        message: `Nothing found for "${code || cleanTerm}". Try a different term.`
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
