# Refine Physio Mobile Official Deployment Guide

This app can become a browser-based staff web app and phone-friendly PWA, but it must go through staging before real client data is used.

## Recommended Hosting Setup

Best fit for the current app:

- Frontend: Render Web Service, served by the existing Node app from `public/`.
- Backend: Render Web Service, same service as the frontend, serving `/api/*`.
- Database: Supabase Pro Postgres if you want managed Postgres plus Supabase Auth; Render Postgres if you want one-provider simplicity.
- Domain/DNS: Cloudflare DNS or your existing domain registrar.
- HTTPS: Render custom domain with automatic TLS.

Why not split frontend and backend yet:

- The current app is a single Node server.
- Keeping frontend and backend on the same domain avoids CORS complexity.
- The Cliniko API key stays backend-only.
- It is easier to test securely before real patient data.

## Current Production Blockers

Do not use real patient data until these are completed:

- Replace the prototype role switcher with real login.
- Move from `server/data/db.json` to PostgreSQL.
- Complete production QA of secure login, session expiry, logout, and role permissions.
- Create real admin/receptionist/practitioner accounts with unique staff passwords.
- Add database backups and restore testing.
- Confirm Cliniko sync with test data only.
- Complete a privacy/security review for health information.

## PWA Status

Added in this build:

- `public/manifest.webmanifest`
- `public/service-worker.js`
- `public/icon.svg`
- `public/icon-192.png`
- `public/icon-512.png`
- `public/offline.html`
- mobile app metadata in `public/index.html`
- install shortcuts for Calendar and Client Records
- owner/admin access to the practitioner calendar workflow

Important safety note:

- The service worker caches the app shell only.
- `/api/*` is not cached.
- Patient data is not intentionally stored for offline access.
- PWA install needs HTTPS in staging/production. Localhost works only for local testing.

How staff install it:

- iPhone: open the HTTPS app URL in Safari, tap Share, then tap Add to Home Screen.
- Android: open the HTTPS app URL in Chrome, tap the menu, then tap Add to Home screen.

## Environment Variables

Set these in the hosting dashboard, not in frontend code and not in Git:

```env
NODE_ENV=production
REFINE_EMPTY_DB=true
APP_BASE_URL=https://app.yourdomain.com
DATABASE_URL=postgres://...
SESSION_SECRET=generate-a-long-random-secret
COOKIE_SECURE=true
REFINE_AUTH_IMPLEMENTED=true

CLINIKO_API_KEY=your_cliniko_test_key_first
CLINIKO_BASE_URL=https://api.au1.cliniko.com/v1
CLINIKO_USER_AGENT=Refine Physio Mobile (admin@refinephysio.com.au)
CLINIKO_POLL_ENABLED=false
CLINIKO_APPOINTMENT_CREATE_ENABLED=false
CLINIKO_APPOINTMENT_WRITE_ENABLED=false
CLINIKO_PATIENT_CREATE_ENABLED=false
CLINIKO_REPORT_UPLOAD_ENABLED=false
CLINIKO_REPORT_UPLOAD_AUTO_ENABLED=false
CLINIKO_POLL_SECONDS=
CLINIKO_SYNC_START_DATE=2026-05-27
CLINIKO_ACTIVE_BUSINESS_ID=
CLINIKO_ALLOW_MULTIPLE_LOCATIONS=false
CLINIKO_ACTIVE_PRACTITIONER_IDS=
CLINIKO_ALLOW_MULTIPLE_PRACTITIONERS=false
```

Set `CLINIKO_SYNC_START_DATE` before first staging or production sync. It is a Brisbane date boundary; appointments before that date and patients linked only to those appointments will not be imported.

The current server has a production safety guard. `NODE_ENV=production` will not start until `DATABASE_URL`, `SESSION_SECRET`, `REFINE_EMPTY_DB=true`, and `REFINE_AUTH_IMPLEMENTED=true` are present. Keep production blocked until the admin account, practitioner accounts, logout, session expiry, and route permissions pass staging QA.

For fast test/staging calendar refreshes, set `CLINIKO_POLL_SECONDS=15`. Keep production polling slower unless the enabled location/practitioner count is small enough to stay well below Cliniko's rate limits.

Later, after testing, enable polling only if the read-only sync is confirmed:

```env
CLINIKO_POLL_ENABLED=true
CLINIKO_POLL_MINUTES=5
```

## Domain Setup

Recommended domain shape:

- Public app: `https://app.refinephysiomobile.com.au`
- Optional staging: `https://staging.refinephysiomobile.com.au`

Steps:

1. Buy or use an existing domain.
2. Put DNS in Cloudflare or your registrar DNS.
3. In Render, add a custom domain to the web service.
4. Copy Render's DNS target.
5. In DNS, add the CNAME record for `app`.
6. Wait for Render to verify the domain.
7. Confirm HTTPS is active before staff use it.

## Deployment Steps

1. Create a private Git repository.
2. Push the app code to the repository.
3. Create a staging database.
4. Apply `server/data/schema.sql` to the staging database.
5. Update the app code to use PostgreSQL instead of `server/data/db.json`.
6. Run the admin seed script and verify secure login and role permissions.
7. Create a Render Web Service.
8. Set build command:

```bash
npm install
```

9. Set start command:

```bash
npm start
```

10. Add environment variables in Render.
11. Deploy staging.
12. Add custom staging domain and confirm HTTPS.
13. Add a Cliniko test API key only.
14. Run `Admin > Cliniko > Sync now`.
15. Enable one Cliniko location and one Cliniko practitioner.
16. Run `Sync now` again.
17. Test the full workflow with test clients only.
18. Only after read-only sync is confirmed, set `CLINIKO_APPOINTMENT_WRITE_ENABLED=true` in staging and test one time/type edit for one Cliniko test appointment.
19. Then set `CLINIKO_REPORT_UPLOAD_ENABLED=true` and keep `CLINIKO_REPORT_UPLOAD_AUTO_ENABLED=false` in staging, then test one manual report upload for one test patient.
20. After sign-off, repeat for production with production environment variables.

## User Account Setup

Recommended account rules:

- Disable public sign-up.
- Admin creates accounts.
- Each practitioner must have a matching `cliniko_practitioner_id`.
- Receptionists can see referrals, bookings, reports, and admin inbox.
- Practitioners can only see their own appointments, clients, notes, and messages.
- Admin can see everything.
- Require strong passwords and password reset.
- Enable MFA if the auth provider supports it.

Initial accounts to create:

| Role | Example account | Access |
| --- | --- | --- |
| Admin | `admin@refinephysio.com.au` | Full system setup, Cliniko sync, reports, users |
| Receptionist | staff email | Referrals, bookings, messages, reports |
| Practitioner | contractor email | Own calendar, own clients, own notes/reports |

## Phone Testing

Test these devices before real use:

- iPhone Safari, small screen such as iPhone SE.
- iPhone Safari, normal screen such as iPhone 14/15.
- Android Chrome, Pixel/Samsung size.
- Laptop Chrome or Edge.

Phone checks:

- Login works.
- Calendar can be read without awkward zooming.
- Appointment modal fits screen.
- Notes and reports can be typed comfortably.
- Buttons are easy to tap.
- PWA can be added to home screen.
- App opens from home screen.
- App opens in standalone mode without browser chrome after home-screen install.
- Calendar date picker, appointment modal, and notes/report forms fit on the screen.
- No patient data appears when offline.
- Logout works.

## Monthly Cost Estimate

Lean staging/early production estimate:

- Render Web Service Starter: about USD $7/month.
- Supabase Pro for Postgres/Auth: about USD $25/month.
- Domain: usually about USD $10-30/year depending on TLD.
- Email/SMS provider for password resets or MFA: varies; start low unless SMS MFA is heavy.

More production-ready estimate:

- Render Pro workspace: USD $25/month plus compute.
- Render Web Service Starter or Standard: USD $7-25/month.
- Supabase Pro: USD $25/month.
- Optional monitoring/logging: USD $0-30/month to start.
- Expected total: about USD $57-105/month before SMS/email usage and compliance add-ons.

One-provider alternative:

- Render Web Service Starter: USD $7/month.
- Render Postgres Basic: USD $6-19/month.
- Render Pro workspace for production-grade workspace features: USD $25/month.
- Expected total: about USD $38-51/month, but you still need to build and maintain custom login.

## Go-Live Checklist

- Staging deploy exists.
- HTTPS confirmed.
- Real login replaces role switcher.
- PostgreSQL replaces JSON file storage.
- Backups are enabled.
- Restore from backup has been tested.
- Cliniko API key is only in backend environment variables.
- Cliniko read-only sync tested with one location and one practitioner.
- No duplicate patients or appointments after repeated syncs.
- Practitioners can only see their own data.
- PWA install tested on iPhone and Android.
- Privacy/security review completed.
- Staff training completed.
- Real client data approved for production use.

## Useful Official References

- Render pricing: https://render.com/pricing
- Render environment variables: https://render.com/docs/configure-environment-variables
- Render custom domains: https://render.com/docs/custom-domains
- Render TLS: https://render.com/docs/tls
- Supabase pricing: https://supabase.com/pricing
- Supabase Auth: https://supabase.com/docs/guides/auth
- MDN PWA installability: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- OAIC Guide to Health Privacy: https://www.oaic.gov.au/privacy/guidance-and-advice/guide-to-health-privacy/
