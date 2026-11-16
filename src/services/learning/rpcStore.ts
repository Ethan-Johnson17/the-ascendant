import type { SupabaseClient } from '@supabase/supabase-js';
import { StoreError, type LearningStore } from './learningService.ts';

/**
 * LearningStore over Supabase RPC. Used only by the `learning` Edge Function, with a service-role
 * client that exists on the server and nowhere else. Never construct this in the browser.
 */
export function createRpcStore(admin: SupabaseClient): LearningStore {
  return {
    async call(fn, args) {
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new StoreError(error.message, error.code);
      return data ?? null;
    },
  };
}
