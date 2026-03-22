import { Env } from '../index';
import { getLocationById } from '../utils/db';
import { getLocationFromST } from '../utils/st-api';

export async function handleLocation(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as { location_id: string };

    if (!body.location_id) {
      return new Response(
        JSON.stringify({ error: 'Missing location_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Try D1 first
    let location = await getLocationById(env.DB, body.location_id);

    // Fallback to ST API
    if (!location) {
      location = await getLocationFromST(env, body.location_id);
    }

    if (!location) {
      return new Response(
        JSON.stringify({ error: 'Location not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Format address for Retell
    const address = [location.address, location.city, location.state, location.zip]
      .filter(Boolean)
      .join(', ');

    return new Response(
      JSON.stringify({
        status: 'success',
        location: {
          id: location.id,
          name: location.name,
          address: address,
          latitude: location.latitude,
          longitude: location.longitude,
          access_notes: location.access_notes || '',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Location handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
