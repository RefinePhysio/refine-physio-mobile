-- Refine Physio Mobile production database target.
-- PostgreSQL is the recommended production store before real client data is used.
-- Cliniko remains the source of truth for patients, practitioners, appointment
-- types, and appointments.

create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin', 'receptionist', 'contractor')),
  discipline text,
  phone text,
  base_suburb text,
  cliniko_practitioner_id text unique,
  cliniko_sync_enabled boolean not null default false,
  cliniko_sync_enabled_at timestamptz,
  cliniko_sync_disabled_at timestamptz,
  password_hash text,
  is_active boolean not null default true,
  requires_login_setup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  cliniko_patient_id text not null unique,
  name text not null,
  date_of_birth date,
  address text,
  suburb text,
  phone text,
  email text,
  funding_type text,
  emergency_contact text,
  risks text,
  diagnosis text,
  goals text,
  cliniko_updated_at timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed', 'conflict')),
  sync_source text not null default 'cliniko',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table appointment_types (
  id uuid primary key default gen_random_uuid(),
  cliniko_appointment_type_id text not null unique,
  name text not null,
  duration_minutes integer not null default 60,
  color text,
  archived_at timestamptz,
  cliniko_updated_at timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed', 'conflict')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cliniko_locations (
  id uuid primary key default gen_random_uuid(),
  cliniko_business_id text not null unique,
  name text not null,
  display_name text,
  address text,
  time_zone text,
  enabled boolean not null default false,
  enabled_at timestamptz,
  disabled_at timestamptz,
  archived_at timestamptz,
  cliniko_updated_at timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed', 'conflict')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  cliniko_id text not null unique,
  client_id uuid not null references clients(id),
  contractor_id uuid not null references app_users(id),
  appointment_type_id uuid references appointment_types(id),
  cliniko_location_id uuid references cliniko_locations(id),
  cliniko_patient_id text not null,
  cliniko_practitioner_id text not null,
  cliniko_appointment_type_id text,
  cliniko_business_id text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no-show')),
  appointment_type_name text,
  service_type text,
  contact_number text,
  address text,
  reason_for_referral text,
  notes_complete boolean not null default false,
  report_complete boolean not null default false,
  cliniko_updated_at timestamptz,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed', 'conflict')),
  sync_error text,
  created_by text not null default 'cliniko',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index appointments_contractor_starts_at_idx on appointments (contractor_id, starts_at);
create index appointments_client_starts_at_idx on appointments (client_id, starts_at desc);
create index appointments_cliniko_location_starts_at_idx on appointments (cliniko_location_id, starts_at);
create index appointments_sync_status_idx on appointments (sync_status);

create table treatment_notes (
  id uuid primary key default gen_random_uuid(),
  cliniko_treatment_note_id text unique,
  appointment_id uuid not null references appointments(id),
  client_id uuid not null references clients(id),
  contractor_id uuid not null references app_users(id),
  note_type text not null default 'Treatment notes',
  fields jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'signed')),
  signed_at timestamptz,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, note_type)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  cliniko_attachment_id text unique,
  appointment_id uuid not null references appointments(id),
  client_id uuid not null references clients(id),
  contractor_id uuid not null references app_users(id),
  report_type text not null check (report_type in ('Initial Physiotherapy Assessment Report', 'Equipment Trial Report')),
  fields jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  completed_at timestamptz,
  upload_filename text,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'synced', 'failed')),
  upload_error text,
  sent_to_case_manager boolean not null default false,
  sent_to_case_manager_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, report_type)
);

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  contractor_id uuid references app_users(id),
  type text not null check (type in ('Equipment trial', 'Ongoing physio', 'Treatment frequency change', 'Other case manager approval')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  seen_by_practitioner_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  recipient_role text,
  recipient_user_id uuid references app_users(id),
  entity_type text not null,
  entity_id text not null,
  title text not null,
  body text,
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references app_users(id),
  recipient_role text,
  recipient_user_id uuid references app_users(id),
  subject text,
  body text not null,
  status text not null default 'sent' check (status in ('sent', 'read', 'archived')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table cliniko_sync_logs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('synced', 'failed', 'pending', 'conflict', 'not_connected')),
  operation text not null,
  entity_type text,
  entity_id text,
  message text,
  created_at timestamptz not null default now()
);

create table sync_errors (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  message text not null,
  status text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index treatment_notes_cliniko_unique_idx
  on treatment_notes (cliniko_treatment_note_id)
  where cliniko_treatment_note_id is not null;

create unique index reports_cliniko_attachment_unique_idx
  on reports (cliniko_attachment_id)
  where cliniko_attachment_id is not null;

create index sync_errors_unresolved_idx on sync_errors (operation, entity_type, created_at desc)
  where resolved_at is null;
