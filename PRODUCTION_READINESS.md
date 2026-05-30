# Production Readiness Plan

This document turns the prototype into a staged production build plan. Use Cliniko test data only until every checklist item below passes.

## Current Status

Completed in this pass:

- Confirmed Cliniko remains the source of truth for patients, practitioners, appointment types, appointments, treatment notes, and patient files.
- Confirmed official Cliniko API endpoints needed for the production workflow.
- Added a safer backend-only Cliniko client with:
  - Basic auth API key kept server-side.
  - Required User-Agent header support.
  - Rate-limit spacing and retry handling for 429 and 5xx responses.
  - Pagination following `links.next`.
  - Read-only sync for Cliniko businesses/locations, practitioners, appointment types, appointment-linked patients, and individual appointments.
  - Location and practitioner filtering before patient appointments are imported.
  - Write features locked off for Step 4.
  - Sync logs and sync error tracking.
  - Manual Sync Now support.
  - Read-sync retry support.
- Added production empty-database bootstrap via `NODE_ENV=production` or `REFINE_EMPTY_DB=true`.
- Added secure email/password login foundation, hashed passwords, HttpOnly session cookies, logout, role-aware bootstrap data, and an owner/admin account path.
- Added a PostgreSQL target schema at `server/data/schema.sql`.
- Added a real PDF download endpoint for reports.
- Added installable PWA shell files for phone home-screen use, without caching `/api/*` patient data.
- Added `OFFICIAL_DEPLOYMENT_GUIDE.md` for hosting, domain, HTTPS, account, PWA, and phone testing steps.
- Added mocked Cliniko tests for read-only sync, duplicate prevention, forced read-only mode, and clear read-sync errors.

Not completed yet:

- Production QA of secure login, session expiry, logout, and role permissions.
- Database migration from JSON file to PostgreSQL.
- Real Cliniko test-account QA.
- Appointment time/type write-back is implemented behind `CLINIKO_APPOINTMENT_WRITE_ENABLED`; live test still required with one Cliniko test appointment before production use.
- Treatment-note sync.
- PDF report upload to Cliniko files is implemented behind `CLINIKO_REPORT_UPLOAD_ENABLED`; live test still required with a Cliniko test patient before production use.
- Production deployment.
- High-quality PDF rendering with exact report layout. The current PDF generator is a dependency-free safety foundation, not final design quality.

## Confirmed Cliniko API Endpoints

Use base URL:

```text
https://api.au1.cliniko.com/v1
```

Confirmed from official Cliniko API docs:

- Patients:
  - `GET /patients`
  - `GET /patients/{id}`
- Practitioners:
  - `GET /practitioners`
  - `GET /practitioners/{id}`
- Appointment types:
  - `GET /appointment_types`
  - `GET /appointment_types/{id}`
  - `GET /practitioners/{practitioner_id}/appointment_types`
- Locations / businesses:
  - `GET /businesses`
  - `GET /businesses/{id}`
- Appointments:
  - `GET /individual_appointments`
  - `GET /individual_appointments/{id}`

Later phases will use write endpoints for appointments, treatment notes, and patient attachments only after test-account QA passes.

## Webhooks

No official Cliniko webhook endpoint was found in the public Cliniko API documentation. Until Cliniko support confirms otherwise, use scheduled polling.

Recommended polling:

- Every 5 minutes in production.
- Every 1-2 minutes only during test-account QA.
- Use `updated_at` filters once the live data shape has been confirmed.
- Keep manual `Sync now` available for admin.

## Cliniko Limits And Rules

- HTTPS only.
- API key uses HTTP Basic auth as `API_KEY:`.
- User-Agent is required in the format `APP_VENDOR_NAME (APP_VENDOR_EMAIL)`.
- Rate limit is 200 requests per minute per user.
- 429 responses include `X-RateLimit-Reset`.
- Date/time values are UTC.
- Paginated endpoints default to 50 records and support up to 100 via `per_page`.
- Follow `links.next` rather than constructing pagination manually.

## Production Environment Variables

```text
NODE_ENV=production
PORT=4173
REFINE_EMPTY_DB=true
DATABASE_URL=postgres://...
SESSION_SECRET=generate-a-long-random-secret
REFINE_AUTH_IMPLEMENTED=true

CLINIKO_API_KEY=...
CLINIKO_BASE_URL=https://api.au1.cliniko.com/v1
CLINIKO_USER_AGENT=Refine Physio Mobile (admin@refinephysio.com.au)
CLINIKO_POLL_ENABLED=true
CLINIKO_POLL_SECONDS=
CLINIKO_POLL_MINUTES=5
CLINIKO_APPOINTMENT_CREATE_ENABLED=false
CLINIKO_PATIENT_CREATE_ENABLED=false
CLINIKO_MIN_REQUEST_INTERVAL_MS=350
CLINIKO_MAX_SYNC_PAGES=20
CLINIKO_SYNC_START_DATE=2026-05-27
CLINIKO_APPOINTMENT_SYNC_PAST_DAYS=14
CLINIKO_APPOINTMENT_SYNC_FUTURE_DAYS=90
CLINIKO_ACTIVE_BUSINESS_ID=
CLINIKO_ALLOW_MULTIPLE_LOCATIONS=false
```

Set `CLINIKO_SYNC_START_DATE` before first production sync. Appointments before that Brisbane date are ignored, and patients are only imported from synced appointments on/after that date.

The server intentionally blocks `NODE_ENV=production` startup until `DATABASE_URL`, a long `SESSION_SECRET`, `REFINE_EMPTY_DB=true`, and `REFINE_AUTH_IMPLEMENTED=true` are configured. Do not go live until login, logout, owner/admin access, receptionist access, practitioner-only access, and session expiry have passed staging QA.

## Data Ownership

Cliniko owns:

- Patients
- Practitioners
- Appointment types
- Locations/businesses
- Appointments
- Calendar schedule
- Treatment notes after sync
- Uploaded report PDFs after upload

This app owns:

- Practitioner mobile workflow UI
- Report drafts before upload
- Admin review state
- Approval request state
- Sync state and audit logs
- Local operational messages

## Duplicate Prevention

Current strategy:

- Patients merge by `clinikoPatientId`.
- Locations merge by `clinikoBusinessId`.
- Appointments merge by `clinikoId`.
- Appointment types merge by `clinikoAppointmentTypeId`.
- Treatment notes store `clinikoTreatmentNoteId` after sync.
- Reports store `clinikoAttachmentId` after upload.
- Report upload checks existing patient attachments by filename before upload.

Report filename format:

```text
Patient Name - Report Type - Appointment Date - Practitioner Name.pdf
```

## Conflict Handling

For Step 4, Cliniko-synced appointments are read-only in this app. If a practitioner tries to move, resize, or reschedule a Cliniko appointment, the app tells them to edit it in Cliniko and then run Sync Now.

For the later write-back phase:

1. Fetch the latest Cliniko appointment.
2. Compare Cliniko `updated_at` with the app's last synced `clinikoUpdatedAt`.
3. If changed, mark local appointment `syncStatus = conflict`.
4. Do not overwrite Cliniko automatically.
5. Admin must review and choose whether to keep Cliniko or push app changes.

## Phases

1. Prototype bug fixes and UI cleanup.
   - Status: mostly done.
2. Secure production backend foundation.
   - Status: started.
3. Secure login.
   - Replace role switcher with email/password or SSO.
   - Password hashes only.
   - Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`.
4. Database migration.
   - Replace JSON with PostgreSQL.
   - Add migrations.
   - Add encrypted backups.
5. Read-only Cliniko sync.
   - Status: implemented with mocked automated tests.
   - Next: confirm location/practitioner setup first, then patient/appointment/appointment type mapping with a Cliniko test account.
6. Appointment write-back.
   - Status: implemented but disabled by default.
   - Next: enable only for one Cliniko test appointment, confirm conflict handling, then review before production use.
7. Treatment note syncing.
   - Status: not enabled.
   - Next: build only after appointment write-back is tested.
8. PDF generation.
   - Replace simple PDF with production renderer.
   - Verify layout and filename.
9. Cliniko patient file upload.
   - Status: implemented but disabled by default.
   - Next: enable only for a Cliniko test patient, confirm duplicate prevention, then review before production use.
10. Sync operations.
   - Manual Sync Now and read-sync retry are available.
   - Add conflict resolution UI in the later write-back phase.
11. Testing and deployment.

## Deployment Plan

Recommended production stack:

- Node.js LTS.
- PostgreSQL.
- HTTPS reverse proxy or managed hosting with TLS.
- Environment variables managed outside source control.
- Daily encrypted database backups.
- Separate staging and production environments.
- Separate Cliniko test/practice credentials for staging.

Steps:

1. Provision server or managed app host.
2. Provision PostgreSQL.
3. Configure HTTPS.
4. Set environment variables.
5. Start with `NODE_ENV=production` and `REFINE_EMPTY_DB=true`.
6. Create first admin user.
7. Connect Cliniko test API key.
8. Run read-only sync.
9. Complete test checklist.
10. Build and test later write-back phases separately.
11. Only then move to real Cliniko credentials.

## Backup Plan

- PostgreSQL daily encrypted backup retained for at least 30 days.
- Weekly restore test into staging.
- Store `.env` secrets in password manager or deployment secret manager.
- Never back up API keys into source control.
- Export audit logs monthly.

## Admin User Setup

Production must not use the prototype role switcher.

Required:

1. Create first admin from server-side setup command.
2. Store password hash, never plaintext.
3. Assign role: `admin`.
4. Add receptionist users with role: `receptionist`.
5. Map practitioners to Cliniko practitioners by `clinikoPractitionerId`.
6. Disable setup command after first admin exists.

## Test Checklist Before Real Patient Data

Use Cliniko test data only.

- Run `node --test` or `npm test` and confirm all mocked Cliniko workflow tests pass.
- Admin books a test patient in Cliniko.
- Admin runs Sync Now once to import Cliniko locations, practitioners, and appointment types only.
- Admin chooses one enabled Cliniko location and one enabled Cliniko practitioner in `Admin > Cliniko`, then runs Sync Now again.
- Manual sync imports only patients linked to appointments for that enabled location/practitioner setup.
- Appointment appears in the app calendar.
- Appointment belongs to the enabled Cliniko location.
- Appointment belongs to the enabled Cliniko practitioner.
- Disabling that location or practitioner prevents new appointments outside the selected setup from showing on the next sync.
- Correct practitioner sees the appointment.
- Other practitioners cannot see it.
- Practitioner cannot move, resize, or reschedule a Cliniko-synced appointment in this Step 4 read-only build.
- Cliniko-side appointment changes appear after Manual Sync Now or polling.
- Failed sync creates a clear sync error.
- Retry button can clear a failed sync after the cause is fixed.
- Audit log records read sync attempts and sync errors.
- Backups run successfully.
- Restore from backup works in staging.
- HTTPS is enforced.
- API key never appears in browser source, network responses, logs, or frontend bundle.

## Known Security Risks To Close

- Current app still has frontend role switching.
- Current persistence is JSON file, not production database.
- No real authentication yet.
- No CSRF protection yet.
- No per-request server-side session authorization yet.
- Report PDF generator is basic.
- Automated tests are started but do not replace live Cliniko test-account QA.
- Scheduled polling exists but must be tested under production hosting before real data.

Do not use real patient data until these are closed.
