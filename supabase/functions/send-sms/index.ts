// Supabase Edge Function: sends the confirmation SMS after an application is submitted.
// Provider: Arkesel (Ghana). To use mNotify/Hubtel, change only the fetch() call below.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    // Read the application with the caller's own token, so row-level security applies.
    const userDb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { application_id } = await req.json();
    const { data: app } = await userDb.from('applications').select('*, profiles!applications_user_id_fkey(*)').eq('id', application_id).single();
    if (!app) return json({ ok: false, error: 'Application not found' }, 404);
    if (app.sms_status === 'sent') return json({ ok: true, already: true });

    const profile = app.profiles as Record<string, unknown> | null;
    let phone = String(app.data?.momo || profile?.phone || '').replace(/\D/g, '');
    if (!phone && typeof profile?.phone === 'string') phone = String(profile.phone).replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '233' + phone.slice(1);
    const first = String(app.full_name).split(' ')[0];
    const message = `Dear ${first}, congratulations! Your application to the Women's Growth Access Programme (WGFG) has been received. Ref: ${app.ref_no}. Our team will contact you after review.`;

    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': Deno.env.get('ARKESEL_API_KEY')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: Deno.env.get('SMS_SENDER') ?? 'WGFG', message, recipients: [phone] }),
    });
    const out = await res.json().catch(() => ({}));
    const ok = res.ok && out.status === 'success';

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await admin.from('applications').update({ sms_status: ok ? 'sent' : 'failed', sms_sent_at: ok ? new Date().toISOString() : null }).eq('id', app.id);
    return json({ ok, provider: out }, ok ? 200 : 502);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 400);
  }
});
