// Supabase Edge Function: sends a confirmation email after an application is submitted.
// Preferred provider: Resend. If RESEND_API_KEY is not set, the function exits safely.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function formatDetailRows(data: Record<string, unknown>) {
  const labels = [
    ['Applicant', data.fullName || data.full_name || '—'],
    ['Reference', data.ref_no || '—'],
    ['Business name', data.bizName || '—'],
    ['Phone', data.momo || '—'],
    ['Amount requested', data.amount ? `GHS ${Number(data.amount).toLocaleString()}` : '—'],
    ['Submission date', new Date().toLocaleDateString('en-GB')],
  ];

  return labels.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0d7b5;color:#5b3d2a;font-weight:600;">${label}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0d7b5;color:#2e2b28;">${String(value)}</td>
    </tr>
  `).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { application_id } = await req.json();
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: app, error } = await service
      .from('applications')
      .select('*, profiles!applications_user_id_fkey(*)')
      .eq('id', application_id)
      .single();

    if (error || !app) return json({ ok: false, error: 'Application not found' }, 404);

    const profile = app.profiles as Record<string, unknown> | null;
    const email = String(profile?.email || app.data?.email || '').trim();
    if (!email) return json({ ok: false, error: 'Applicant email not found' }, 400);

    const { data: admins } = await service.from('profiles').select('email').eq('role', 'admin').not('email', 'is', null);
    const adminEmails = [...new Set((admins ?? []).map((row) => String((row as Record<string, unknown>).email ?? '').trim()).filter(Boolean))];

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) return json({ ok: false, error: 'RESEND_API_KEY is not set on the project.' }, 400);

    const mailTargets = [
      { to: [email], subject: `WGAP application received: ${app.ref_no}`, label: 'Applicant' },
      ...adminEmails.filter((adminEmail) => adminEmail !== email).map((adminEmail) => ({
        to: [adminEmail],
        subject: `New WGAP application received: ${app.ref_no}`,
        label: 'Admin',
      })),
    ];

    let sentCount = 0;
    for (const target of mailTargets) {
      const payload = {
        from: 'WGFG <noreply@resend.dev>',
        to: target.to,
        subject: target.subject,
        html: `
          <div style="font-family:Arial,sans-serif;background:#f9f4ee;padding:28px;">
            <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #f0d7b5;border-radius:14px;overflow:hidden;">
              <div style="background:#f0b749;padding:20px 24px;color:#1d1b16;font-weight:700;font-size:24px;letter-spacing:0.03em;">Women's Growth Access Programme</div>
              <div style="padding:24px; color:#2e2b28;">
                <h2 style="margin:0 0 10px; color:#1d1b16;">${target.label === 'Admin' ? 'New application notification' : 'Application received'}</h2>
                <p style="margin:0 0 18px;">Dear ${target.label === 'Admin' ? 'WGFG Team' : String(profile?.full_name || app.full_name)},</p>
                <p style="margin:0 0 18px;">${target.label === 'Admin' ? 'A new WGAP applicant has submitted their application for review.' : 'Your loan application has been successfully submitted to Women\'s Growth Finance Ghana. We have attached the details below for your records.'}</p>
                <table style="width:100%;border-collapse:collapse;background:#fffdf9;border:1px solid #f0d7b5;border-radius:10px;overflow:hidden;">
                  ${formatDetailRows(app.data as Record<string, unknown>)}
                </table>
                <p style="margin:20px 0 0;">${target.label === 'Admin' ? 'Please review the application in the admin dashboard.' : 'Thank you for applying to WGAP. Our team will review your application and contact you soon.'}</p>
              </div>
            </div>
          </div>
        `,
      };

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const out = await response.json().catch(() => ({}));
      if (response.ok && Boolean(out.id)) sentCount += 1;
    }

    const ok = sentCount > 0;

    await service
      .from('applications')
      .update({ email_status: ok ? 'sent' : 'failed', email_sent_at: ok ? new Date().toISOString() : null })
      .eq('id', application_id);

    return json({ ok, provider: 'resend', sentCount, admins: adminEmails.length }, ok ? 200 : 502);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 400);
  }
});
