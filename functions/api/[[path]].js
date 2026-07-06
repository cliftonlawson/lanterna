import { handleLanternaApiRequest } from '../../src/server/lanternaApi.js';

export async function onRequest(context) {
  return handleLanternaApiRequest(context.request, { env: context.env });
}
