/**
 * Dev-only seed endpoint.
 *
 * POST /api/seed runs the demo seed against the live DB using the service-role
 * client (bypasses RLS). Guarded so it can never run in production. The CLI
 * (`npm run seed`) is the primary path; this is a convenience for local dev.
 */

import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';
import { runSeed } from '../../../../supabase/seed/seed';

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Seeding is disabled in production.' },
      { status: 403 }
    );
  }

  try {
    const supabase = createServiceClient();
    const { counts, demo } = await runSeed(supabase);
    return NextResponse.json({ ok: true, counts, demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
