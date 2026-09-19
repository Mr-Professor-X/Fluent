import { activeRepository } from './services/container';
/** Replace with a signed session/JWT verifier in production. Never trust a body-supplied user id. */
export async function requireUser(request: Request) { const id = request.headers.get('x-fluid-user-id') ?? 'alex'; const user = await activeRepository.getUser(id); if (!user) throw new Error('Unauthorized'); return user; }
