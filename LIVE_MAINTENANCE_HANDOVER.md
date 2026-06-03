# Refine Physio Mobile - Live Maintenance Handover

Last updated: 3 June 2026

## Live App

- Live web app: https://refine-physio-mobile.onrender.com/
- Hosting: Render web service
- Render service id: `srv-d8d97q68bjmc739u3420`
- GitHub repository: https://github.com/RefinePhysio/refine-physio-mobile
- Main branch: `main`

## Current Production Sync Setup

- Cliniko is connected by secure backend environment variables.
- Cliniko API key is stored on Render only, never in frontend code.
- OpenAI API key is stored on Render only, never in frontend code.
- Cliniko source of truth is still Cliniko.
- App-created bookings/appointment edits write back to Cliniko when write settings are enabled.
- Cliniko-to-app changes sync by:
  - scheduled polling every 15 seconds
  - foreground sync when users log in, open the app, or return to the app from phone/background
- Cliniko webhooks are not available in this app setup, so true instant push from Cliniko is not possible.

## Active Cliniko Scope

- The app is set up to use the Refine Physio Mobile location only.
- Practitioners must be enabled in Admin > Cliniko before their schedules sync.
- Practitioners should only see their own appointments and unavailable blocks.
- Admin/owner can switch between practitioner views.

## Important Production Rules

- Do not put API keys, passwords, or patient data into code or GitHub.
- Keep Cliniko keys and OpenAI keys in Render environment variables only.
- Use test changes first before changing real client workflows.
- Run tests before every deploy.
- After every deploy, verify:
  - `/api/health`
  - Admin > Cliniko sync status
  - practitioner calendar on desktop
  - practitioner calendar on phone
  - appointment create/edit write-back
  - report PDF upload
  - AI report polish if OpenAI key is enabled

## Common Future Edit Workflow

1. Make code changes locally in `C:\Users\jenni\Documents\Codex\Refine Physio Mobile`.
2. Run tests with Node:
   `node --test`
3. Commit changes to Git.
4. Push to GitHub `main`.
5. Render automatically deploys the new version.
6. Check the live site after deploy.

## Phone/PWA Notes

- The app is installable on iPhone/Android as a PWA.
- If phone users do not see a new update after deploy, ask them to close and reopen the app.
- If still stuck, clear browser/PWA cache or remove and re-add the home screen app.
- Service worker cache version should be bumped when changing `app.js` or `styles.css`.

## Current Important Features

- Secure login with admin, receptionist, and practitioner roles.
- Admin user management.
- Admin Cliniko settings and sync logs.
- Cliniko sync for:
  - location
  - practitioners
  - patients linked to synced appointments
  - appointment types
  - appointments
  - working hours
  - unavailable blocks
- Calendar by practitioner.
- Practitioner-only visibility for own schedule.
- Appointment create/edit write-back to Cliniko.
- Reports and treatment note PDF upload to Cliniko files.
- Canva-style report templates recreated in app PDF generation.
- AI report polish for report sections when OpenAI key is configured.
- Admin report review and reminders.
- Admin/practitioner messages.

## Key Environment Variables On Render

Do not save actual values here.

- `CLINIKO_API_KEY`
- `CLINIKO_BASE_URL`
- `CLINIKO_USER_AGENT`
- `CLINIKO_POLL_ENABLED`
- `CLINIKO_POLL_SECONDS`
- `CLINIKO_SYNC_START_DATE`
- `CLINIKO_APPOINTMENT_SYNC_PAST_DAYS`
- `CLINIKO_APPOINTMENT_SYNC_FUTURE_DAYS`
- `CLINIKO_APPOINTMENT_CREATE_ENABLED`
- `CLINIKO_APPOINTMENT_WRITE_ENABLED`
- `CLINIKO_PATIENT_CREATE_ENABLED`
- `CLINIKO_REPORT_UPLOAD_ENABLED`
- `CLINIKO_REPORT_UPLOAD_AUTO_ENABLED`
- `CLINIKO_NOTE_UPLOAD_ENABLED`
- `CLINIKO_NOTE_UPLOAD_AUTO_ENABLED`
- `CLINIKO_ALLOW_MULTIPLE_LOCATIONS`
- `CLINIKO_ALLOW_MULTIPLE_PRACTITIONERS`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SESSION_SECRET`
- `REFINE_EMPTY_DB`
- `REFINE_AUTH_IMPLEMENTED`

## If Sync Seems Wrong

Check these first:

- Is the appointment in the Refine Physio Mobile Cliniko location?
- Is the practitioner enabled in Admin > Cliniko?
- Is the appointment after the configured sync start date?
- Is the patient attached to the appointment in Cliniko?
- Did the app show any recent sync errors in Admin > Cliniko?
- Did the practitioner close/reopen the phone app after deployment?

## Current Deployment State

- Latest known live-sync improvement commit: `85325fb Trigger Cliniko sync on app foreground`
- Latest known unavailable-block sync commit: `4bf038e Sync Cliniko unavailable blocks`
- Tests were passing at the time this handover note was created.

