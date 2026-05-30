# Refine Physio Mobile - Current Prototype Status

Last updated: 2026-05-27

## How to Restart

```powershell
.\start.ps1
```

Then open:

```text
http://localhost:4173
```

## Current Prototype Includes

- Practitioner mobile dashboard
- Cliniko-style daily/weekly calendar
- Physio-only prototype mode: Admin and physiotherapist contractor surfaces only
- 15-minute calendar increments
- Rebook worklist for patients without upcoming appointments
- Calendar-gap booking from the rebook screen
- Practitioner rebooking now creates a provisional slot that requires admin approval before confirmation
- Notes due and reports due worklists grouped by overdue, today, and upcoming
- Linked report drafts with draft, ready for admin review, and final statuses
- Practitioner approval requests and approval status tracking
- Admin/reception inbox for approval requests, rebook decisions, and new referral triage
- Admin/reception new patient booking form
- Appointment details showing full name, address, contact number, appointment type, and reason for referral
- Treatment note templates
- Initial physiotherapy assessment note structure with selectable outcome measures, custom "Other" measures, and normative-value prompts
- Initial Physiotherapy Assessment Report now follows the same structured initial physio assessment format
- Structured Equipment Trial Report fields with expandable equipment trials, two default model spaces, delete controls, auto-listed chosen model recommendations, additional recommendations, and plan
- Report draft generation
- Cliniko integration boundary ready for credentials

## Product Vision

The product vision has been saved in `PRODUCT_VISION.md`.

## Next Version Plan

Recommended changes and future build phases have been saved in `NEXT_VERSION_PLAN.md`.

## Important Notes

- Demo data is stored in `server/data/db.json`.
- Do not use real patient data in the prototype until hosting, authentication, privacy controls, audit logging, and secure storage are production-ready.
- Cliniko should remain the source of truth for real patients, practitioners, calendars, and bookings.
- Current local backup includes the latest inbox workflow and can be found in the `backups` folder.
