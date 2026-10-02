# WGAP Application Portal (WGFG)

HTML + CSS + a little JavaScript. Supabase handles login, database and SMS sending.

## Setup (new project)
1. Supabase > SQL Editor: run `supabase/schema.sql`. (Already ran the first version? Run `supabase/update_v2.sql` instead. It also fixes "Email not confirmed".)
2. Put your Project URL and anon key in `js/config.js`.
3. Create your account on the site, then run the `update ... role = 'admin'` line at the bottom of schema.sql with your email.
4. Deploy the folder as a static site (Vercel / Netlify / any host).

## SMS after submission (Arkesel)
1. Create an Arkesel account, register a sender ID (e.g. WGFG) and top up credits.
2. Install the Supabase CLI, then from this folder:
   ```
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set ARKESEL_API_KEY=your_key SMS_SENDER=WGFG
   supabase functions deploy send-sms
   ```
3. When an applicant submits, the page calls `send-sms`, which texts the number they gave as MoMo. Admins see the SMS status per applicant and can retry a failed one.
The application is always saved even if the SMS fails.

## Reference numbers
First applicant to log in gets `000-<INITIALS>` (e.g. `000-PJD`), then `001-...`, `002-...`.

## Editing questions
All questions live in `js/questions.js`; the form, admin view and printout update together.
