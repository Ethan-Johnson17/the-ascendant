// The Ascendant — `learning` Edge Function (Deno, runs on Supabase).
//
// Starts checks, marks submitted answers (written ones via the Examiner) and records completed
// lessons for the signed-in player.
// All rules live in the shared game engine (src/engine/learning); this file only authenticates the
// caller and wires the engine to the database. The service-role key is provided by Supabase to
// this function at runtime and never leaves the server.

import { createClient } from '@supabase/supabase-js';
import { createLearningService } from '../../../src/services/learning/learningService.ts';
import { createRpcStore } from '../../../src/services/learning/rpcStore.ts';
import { createExaminer } from '../../../src/services/ai/examinerService.ts';
import { providerFromEnv } from '../../../src/services/ai/providerFromEnv.ts';
import { createBossPlanner } from '../../../src/services/ai/bossPlanner.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const store = createRpcStore(admin);

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
  if (!url || !serviceKey) return reply(500, { error: 'The learning service is not configured.' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return reply(401, { error: 'Please sign in again.' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'The request was not understood.' });
  }

  // AI settings are read per request, so changing a secret takes effect without a redeploy.
  const provider = providerFromEnv((name) => Deno.env.get(name));
  const examiner = createExaminer(store, provider);
  const bossPlanner = createBossPlanner(store, provider);
  const result = await createLearningService(store, { examiner, bossPlanner }).handle(data.user.id, body);
  if (result.status >= 500) console.error('learning: request failed', { status: result.status });
  return reply(result.status, result.body);
});
