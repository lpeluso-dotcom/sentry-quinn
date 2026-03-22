import { Env } from '../index';
import { getPricebookItem } from '../utils/db';

export async function handlePricebook(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as { code?: string; name?: string };

    if (!body.code && !body.name) {
      return new Response(
        JSON.stringify({ error: 'Missing code or name' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const item = await getPricebookItem(env.DB, body.code, body.name);

    if (!item) {
      return new Response(
        JSON.stringify({
          status: 'not_found',
          message: 'Item not found in pricebook',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        item: {
          code: item.code,
          name: item.name,
          description: item.description || '',
          price: item.price || 0,
          category: item.category || '',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Pricebook handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
