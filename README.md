# Refine Physio Mobile

Mobile contractor management portal MVP for Refine Physio Mobile.

This build started as a local, dependency-free prototype and now includes the first production-facing Cliniko integration foundation:

- Admin referral dashboard
- Contractor mobile schedules
- Role-filtered client and appointment visibility
- Practitioner rebooking for assigned mobile patients
- Treatment note drafts and signed notes
- Practitioner "Approvals needed" requests for case-manager approvals
- Report draft creation
- Approval requests
- Backend-only Cliniko integration boundary using the official API authentication pattern
- Step 4 read-only Cliniko sync for practitioners, patients, appointment types, and appointments
- Sync logs and sync error tracking
- Report PDF download endpoint
- Secure login foundation with admin/receptionist/practitioner roles
- PWA support for browser use and phone home-screen install

## Run Locally

From this folder:

```powershell
.\start.ps1
```

Then open:

```text
http://localhost:4173
```

If PowerShell blocks local scripts, run:

```powershell
& "C:\Users\jenni\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server/index.js
```

## Check The Read-Only Sync Workflow

Run:

```powershell
& "C:\Users\jenni\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test
```

On a standard Node.js install, `npm test` runs the same test suite. The automated tests use mocked Cliniko test data. They confirm read-only sync imports setup data first, only imports appointment-linked patients after a location and practitioner are enabled, prevents duplicate appointments, filters appointments to the enabled test location and practitioner, stays read-only even if later write flags are set, and records read-sync errors clearly.

## Cliniko Setup

Copy `.env.example` to `.env` and set:

```text
CLINIKO_API_KEY=your_test_cliniko_api_key
CLINIKO_BASE_URL=https://api.au1.cliniko.com/v1
CLINIKO_USER_AGENT=Refine Physio Mobile (your-email@example.com)
CLINIKO_POLL_ENABLED=false
CLINIKO_APPOINTMENT_CREATE_ENABLED=false
CLINIKO_APPOINTMENT_WRITE_ENABLED=false
CLINIKO_PATIENT_CREATE_ENABLED=false
CLINIKO_REPORT_UPLOAD_ENABLED=false
CLINIKO_REPORT_UPLOAD_AUTO_ENABLED=false
CLINIKO_POLL_SECONDS=
CLINIKO_SYNC_START_DATE=2026-05-27
CLINIKO_APPOINTMENT_SYNC_PAST_DAYS=14
CLINIKO_APPOINTMENT_SYNC_FUTURE_DAYS=90
CLINIKO_ACTIVE_BUSINESS_ID=
CLINIKO_ALLOW_MULTIPLE_LOCATIONS=false
CLINIKO_ACTIVE_PRACTITIONER_IDS=
CLINIKO_ALLOW_MULTIPLE_PRACTITIONERS=false
```

The API key should never be committed or pasted into chat. Use a Cliniko test account first. This build reads Cliniko by default; appointment time/type write-back and report upload are separately gated by environment variables.

Set `CLINIKO_SYNC_START_DATE` before connecting a real Cliniko account. Appointments before that Brisbane date are ignored, and patients are only imported if they are linked to synced appointments on/after that date. This prevents old Cliniko history from flooding the app during first live sync.

For test/staging, `CLINIKO_POLL_SECONDS=15` gives near-real-time Cliniko-to-app calendar updates. App-to-Cliniko appointment creates and time/type edits are pushed immediately when the matching create/write flags are enabled. Use a slower interval for production if more locations or practitioners are enabled.

For initial testing, leave `CLINIKO_ACTIVE_BUSINESS_ID` and `CLINIKO_ACTIVE_PRACTITIONER_IDS` blank. Run `Sync now` once to import setup data only: locations, practitioners, and appointment types. Then use `Admin > Cliniko` to enable one Cliniko location and one Cliniko practitioner, and run `Sync now` again. Patient details and appointments are only imported after both are selected. Setting `CLINIKO_ACTIVE_BUSINESS_ID` or `CLINIKO_ACTIVE_PRACTITIONER_IDS` forces those choices from the environment, so only use those overrides after you are certain the IDs are safe for testing.

Appointment creation and time/type write-back are built but disabled by default. To test app-created bookings, set `CLINIKO_APPOINTMENT_CREATE_ENABLED=true`; set `CLINIKO_PATIENT_CREATE_ENABLED=true` too if new patients created in this app should also be created in Cliniko before booking. To test editing, set `CLINIKO_APPOINTMENT_WRITE_ENABLED=true`, restart the app, edit the synced appointment's time/type in the calendar, then confirm the same change appears in Cliniko. The app checks the Cliniko `updated_at` value first and stops with a conflict if Cliniko changed since the last sync.

Report PDF upload to Cliniko files is built but disabled by default. To test with a single test patient only, set `CLINIKO_REPORT_UPLOAD_ENABLED=true` and keep `CLINIKO_REPORT_UPLOAD_AUTO_ENABLED=false`, restart the app, then use the manual `Upload to Cliniko` button on one completed initial or equipment trial report in the admin Reports tab. Duplicate upload prevention checks for an existing patient attachment with the same filename before uploading.

## Production Safety

For production or staging, start with an empty database:

```text
NODE_ENV=production
REFINE_EMPTY_DB=true
```

Do not use real patient data until secure login, PostgreSQL persistence, backups, HTTPS, audit logging, and the Cliniko test checklist are complete.

## Current Scope

This is still an MVP foundation. It uses a JSON file for local persistence so the workflows can be tested immediately. PostgreSQL and real authentication are required before production use.

See `server/data/schema.sql` for the production database target, `PRODUCTION_READINESS.md` for the production migration plan and test checklist, and `OFFICIAL_DEPLOYMENT_GUIDE.md` for the recommended web/mobile hosting setup.

## Phone Home-Screen Install

Use an HTTPS staging or production URL.

- iPhone: open the app in Safari, tap Share, then Add to Home Screen.
- Android: open the app in Chrome, tap the menu, then Add to Home screen.

The service worker caches only the app shell. API responses and patient data are not cached for offline use.
