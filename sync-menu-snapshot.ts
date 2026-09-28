// Supabase Edge Function: sync-menu-snapshot
//
// Paste this into Dashboard → Edge Functions → New function ("sync-menu-snapshot") → Deploy.
// Runs on Supabase's own infrastructure — nothing here ever touches the
// website's hosting, so once this is deployed it never needs redeploying
// again just because the menu changed.
//
// What it does: reads the live menu_items table, reshapes it into the same
// { section: { category: [items] } } tree renderMenus() expects (see
// script.js), and overwrites menu.json in the public "menu-cache" storage
// bucket. A Database Webhook (set up separately, see the setup steps) calls
// this automatically every time a row in menu_items changes, so the public
// snapshot is never more than a few seconds behind whatever's live.
//
// script.js fetches that public file as a fast, always-fresh-ish source —
// see fetchMenuFromSnapshot() — before falling back to the slower direct
// table query, and before the last-resort bundled menu-data.js.

import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'menu-cache';
const OBJECT_PATH = 'menu.json';

// The fixed set of pages/categories the site supports — mirrors CHAPTERS in
// admin.js. (The drinks photo gallery is plain HTML in drinks.html, not
// data.) Anything outside this list (e.g. a
// category added directly in the table, bypassing the admin page) is left
// out of the snapshot on purpose, same as the old static fallback file.
const CATEGORIES: [string, string][] = [
  ['food', 'popular'], ['food', 'pizza'], ['food', 'hamburgers'],
  ['drinks', 'popular'], ['drinks', 'coffee'], ['drinks', 'cocktails'],
];

type Row = {
  section: string; category: string; name: string; price: number;
  description: string | null;
  sort_order: number; created_at: string;
};

Deno.serve(async (req) => {
  // Lightweight guard so a stranger who finds this function's URL can't
  // spam it. The Database Webhook is configured to send this same header —
  // see the setup steps. Not a real auth system, just enough friction to
  // stop casual abuse of a function that only ever republishes public data.
  const expected = Deno.env.get('SYNC_SECRET');
  if (expected && req.headers.get('x-sync-secret') !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically —
  // no need to set these two yourself. The service role key is required
  // here (not the anon key) so this can write to storage regardless of
  // bucket policies; it never leaves this server-side function.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: rows, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tree: Record<string, Record<string, unknown[]>> = {};
  for (const [section, category] of CATEGORIES) {
    const list = ((rows as Row[]) ?? [])
      .filter((r) => r.section === section && r.category === category)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      .map((r) => {
        const item: Record<string, unknown> = { name: r.name, price: r.price };
        if (r.description) item.description = r.description;
        return item;
      });
    (tree[section] ??= {})[category] = list;
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(OBJECT_PATH, new Blob([JSON.stringify(tree)], { type: 'application/json' }), {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '60', // short — this file is meant to always be near-live, not long-cached
    });

  if (uploadError) {
    return new Response(JSON.stringify({ error: uploadError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, updatedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
