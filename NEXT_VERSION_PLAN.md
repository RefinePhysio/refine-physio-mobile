# Refine Physio Mobile - Next Version Plan

## Purpose

This plan captures the changes that would make the software stronger, simpler, and more aligned with the product vision:

- reduce admin workload
- reduce double handling
- support mobile contractors on the road
- keep Cliniko as the source of truth
- centralise the extra mobile workflow around referrals, rebooking, approvals, notes, reports, and contractor visibility

## Product Direction

The app should become a mobile operations layer that sits beside Cliniko. Cliniko should continue to own patients, calendars, practitioners, and appointment records. Refine Physio Mobile should own the mobile workflow around:

- referral intake
- contractor allocation
- appointment context
- rebooking follow-up
- notes due
- reports due
- approval requests
- case-manager communication tasks
- mobile contractor documentation
- admin/reception visibility

## Recommended Next Changes

### 1. Reception Inbox

Status: first version built in the current prototype.

Add a dedicated reception/admin inbox for:

- rebook status messages
- approval outcomes
- case-manager follow-up tasks
- new patient booking checks
- incomplete appointment details
- unassigned referrals

Each item should have a status:

- new
- in progress
- waiting on case manager
- resolved
- closed

This would make the app much more useful for admin/reception instead of just sending notifications into a general list.

Next improvements:

- add admin notes on each inbox item
- add due dates and owner assignment
- link each item to the exact client, appointment, referral, or approval record
- add filters for new, waiting, resolved, and high priority

### 2. Rebooking Workflow

Status: provisional rebook slots now require admin approval before confirmation.

Improve the rebooking workflow so it becomes one of the main contractor tools.

Suggested improvements:

- show all clients without a future appointment
- show last appointment date
- show last appointment type
- show last note summary
- show funding type
- show whether approval is required before rebooking
- allow contractor to book directly into a free calendar gap
- allow contractor to mark "do not rebook" with a reason
- send "do not rebook" reasons to reception inbox
- hold practitioner-requested rebook slots as pending approval before they are confirmed

### 3. Notes Due Workflow

Status: grouped overdue/today/upcoming worklists are now built in the current prototype.
Initial physiotherapy assessment notes now include structured sections, selectable outcome measures, custom "Other" measures, and normative-value prompts.
The Initial Physiotherapy Assessment Report now follows the same structured initial physio assessment format.

Make notes due a clear task list.

Suggested improvements:

- group by today, overdue, upcoming
- show appointment type and funding type
- show note template based on profession
- allow quick "complete note" from the list
- autosave drafts
- show signed/not signed state
- add admin visibility of overdue notes

### 4. Reports Due Workflow

Status: first version built with appointment-linked report drafts and draft/ready/final statuses.
Equipment Trial Reports now include expandable trialled equipment sections, each with two default model spaces, delete controls for added models, chosen model, clinical reasoning, auto-listed recommendations from chosen models, additional recommendations, and plan.

Reports should only be required for relevant appointment types:

- Initial Physiotherapy SAH
- Initial Physiotherapy CHSP
- Initial Occupational Therapy Assessment
- Equipment Trial
- Equipment Trial Report

Suggested improvements:

- show reports due by contractor
- show report type required
- show due date
- generate reports from structured fields
- save drafts
- mark ready for admin review
- mark final
- export to PDF
- future: sync final PDF back to Cliniko if possible

Next improvements:

- add admin review comments before finalising
- add report due date rules based on appointment date
- let admin bulk-filter by contractor and status
- require key fields before a report can be marked final

### 5. Approval Workflow

Approvals should become a proper workflow, not just a message.

Suggested statuses:

- sent to admin
- admin reviewing
- sent to case manager
- waiting on case manager
- approved
- declined
- more information required

Suggested fields:

- client
- appointment
- requested approval
- clinical reason
- funding type
- case manager
- date sent
- date outcome received
- admin notes
- contractor notification

### 6. Cliniko Integration

Cliniko should remain the source of truth.

Recommended integration order:

1. Read practitioners from Cliniko
2. Read patients from Cliniko
3. Read appointments from Cliniko
4. Match contractors to Cliniko practitioner IDs
5. Push app-created bookings into Cliniko
6. Pull appointment status/cancellation changes back from Cliniko
7. Add conflict checking before booking
8. Future: attach final reports to patient records if supported

### 7. Contractor Calendar

The calendar should stay Cliniko-like but be simplified for mobile contractors.

Suggested improvements:

- day/week toggle
- 15-minute increments
- colour by appointment type/status
- tap empty slot to rebook
- tap appointment to view details
- show client address, contact, appointment type, and reason for referral
- show maps button
- show complete note button
- show approval needed button
- future: drag-to-reschedule

### 8. Admin Dashboard

Improve admin visibility.

Suggested admin dashboard sections:

- new referrals
- unassigned referrals
- today’s appointments
- notes overdue
- reports overdue
- approvals waiting
- rebook messages from contractors
- cancellations/no-shows
- contractor availability
- contractor workload

### 9. Client Record

Each client record should become the single mobile-service view.

Suggested sections:

- personal details
- address and contact
- funding type
- referral source
- case manager
- diagnosis/reason for referral
- goals
- risks/alerts
- assigned practitioner
- appointment history
- treatment notes
- reports
- approval history
- rebooking history

### 10. Permissions and Privacy

Before using real patient data, add:

- secure login
- role-based access
- contractor-only assigned client access
- audit logs
- encrypted database
- encrypted file storage
- session timeout
- production hosting
- backup policy
- Australian privacy compliance review

## Suggested Build Phases

### Phase 1: Workflow Prototype

Complete the internal workflow logic using demo data:

- reception booking
- contractor calendar
- rebooking
- notes due
- reports due
- approvals
- admin inbox

### Phase 2: Data and Security Foundation

Replace the JSON file with a real database:

- PostgreSQL
- proper user accounts
- authentication
- role permissions
- audit logs
- secure document storage

### Phase 3: Cliniko Integration

Connect real Cliniko data:

- patients
- practitioners
- appointments
- cancellations
- appointment creation
- appointment updates

### Phase 4: Reporting System

Build the structured report system:

- report templates
- field mapping
- branded PDF generation
- draft/final workflow
- email/export
- admin review

### Phase 5: Production Readiness

Prepare for real business use:

- hosting
- backups
- monitoring
- privacy/security review
- contractor onboarding
- admin training
- data retention policy

## Highest-Impact Next Feature

The Admin/Reception Inbox first version is now built. The next best feature is a stronger **Notes Due and Reports Due workflow**.

Reason:

Notes and reports are the highest-risk operational tasks because they affect care quality, contractor accountability, and admin follow-up. The app should make overdue notes, required reports, drafts, and final reports very obvious, with one-tap completion for practitioners and clear visibility for admin.

## Design Principle

Every screen should answer one practical question:

- What do I need to do today?
- Which client needs action?
- What information do I need before I act?
- Who needs to be notified?
- Has the task been completed?

If a feature does not make one of those questions easier, it should wait.
