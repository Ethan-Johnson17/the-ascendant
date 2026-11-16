// The Ascendant — `ai` Edge Function (Deno, runs on Supabase).
//
// AI features for the signed-in player (Phase 4 Milestone A: the Tutor). The AI provider key is an
// Edge Function secret (AI_API_KEY) that never leaves the server; the service-role key is provided
// by Supabase at runtime. The AI only explains here: it cannot change game state.

import { createClient } from '@supabase/supabase-js';
import { createAiService } from '../../../src/services/ai/aiService.ts';
import { providerFromEnv } from '../../../src/services/ai/providerFromEnv.ts';
import { createRpcStore } from '../../../src/services/learning/rpcStore.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const service = createAiService(createRpcStore(admin), providerFromEnv((name) => Deno.env.get(name)));

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  if (!url || !serviceKey) return reply(500, { error: 'The AI service is not configured.' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return reply(401, { error: 'Please sign in again.' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'The request was not understood.' });
  }

  const result = await service.handle(data.user.id, body);
  // Logs carry the outcome only: never the question, the material or the answer.
  if (result.status >= 500) console.error('ai: request failed', { status: result.status, code: (result.body as { code?: unknown }).code });
  return reply(result.status, result.body);
});
