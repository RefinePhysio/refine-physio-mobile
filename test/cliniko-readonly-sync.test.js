import assert from "node:assert/strict";
import test from "node:test";
import {
  createClinikoAppointmentFromApp,
  getClinikoConfig,
  syncCliniko,
  uploadReportPdfToCliniko,
  treatmentNotePdfFilename,
  updateClinikoLocationEnabled,
  updateClinikoPractitionerEnabled,
  uploadTreatmentNotePdfToCliniko
} from "../server/services/cliniko.js";

const envKeys = [
  "CLINIKO_API_KEY",
  "CLINIKO_BASE_URL",
  "CLINIKO_USER_AGENT",
  "CLINIKO_POLL_ENABLED",
  "CLINIKO_POLL_SECONDS",
  "CLINIKO_POLL_MINUTES",
  "CLINIKO_MIN_REQUEST_INTERVAL_MS",
  "CLINIKO_MAX_SYNC_PAGES",
  "CLINIKO_SYNC_START_DATE",
  "CLINIKO_APPOINTMENT_SYNC_PAST_DAYS",
  "CLINIKO_APPOINTMENT_SYNC_FUTURE_DAYS",
  "CLINIKO_WRITE_ENABLED",
  "CLINIKO_NOTE_SYNC_ENABLED",
  "CLINIKO_APPOINTMENT_CREATE_ENABLED",
  "CLINIKO_REPORT_UPLOAD_ENABLED",
  "CLINIKO_REPORT_UPLOAD_AUTO_ENABLED",
  "CLINIKO_PATIENT_CREATE_ENABLED",
  "CLINIKO_NOTE_UPLOAD_ENABLED",
  "CLINIKO_NOTE_UPLOAD_AUTO_ENABLED",
  "CLINIKO_APPOINTMENT_WRITE_ENABLED",
  "CLINIKO_ACTIVE_BUSINESS_ID",
  "CLINIKO_ALLOW_MULTIPLE_LOCATIONS",
  "CLINIKO_ACTIVE_PRACTITIONER_IDS",
  "CLINIKO_ALLOW_MULTIPLE_PRACTITIONERS"
];

function blankDb() {
  return {
    users: [],
    clients: [],
    appointments: [],
    appointmentTypes: [],
    clinikoLocations: [],
    clinikoSyncLogs: [],
    syncErrors: []
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : "";
      }
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function setClinikoEnv(overrides = {}) {
  process.env.CLINIKO_API_KEY = "test-api-key";
  process.env.CLINIKO_BASE_URL = "https://mock.cliniko.test/v1";
  process.env.CLINIKO_USER_AGENT = "Refine Physio Mobile Test (test@example.com)";
  process.env.CLINIKO_POLL_ENABLED = "false";
  process.env.CLINIKO_POLL_SECONDS = "";
  process.env.CLINIKO_POLL_MINUTES = "5";
  process.env.CLINIKO_MIN_REQUEST_INTERVAL_MS = "1";
  process.env.CLINIKO_MAX_SYNC_PAGES = "2";
  process.env.CLINIKO_SYNC_START_DATE = "";
  process.env.CLINIKO_APPOINTMENT_SYNC_PAST_DAYS = "7";
  process.env.CLINIKO_APPOINTMENT_SYNC_FUTURE_DAYS = "30";
  process.env.CLINIKO_APPOINTMENT_CREATE_ENABLED = "false";
  process.env.CLINIKO_APPOINTMENT_WRITE_ENABLED = "false";
  process.env.CLINIKO_PATIENT_CREATE_ENABLED = "false";
  process.env.CLINIKO_REPORT_UPLOAD_ENABLED = "false";
  process.env.CLINIKO_REPORT_UPLOAD_AUTO_ENABLED = "false";
  process.env.CLINIKO_NOTE_UPLOAD_ENABLED = "false";
  process.env.CLINIKO_NOTE_UPLOAD_AUTO_ENABLED = "false";
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
}

async function withMockCliniko(mockFetch, run, overrides = {}) {
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  setClinikoEnv(overrides);
  globalThis.fetch = mockFetch;

  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("Cliniko read-only sync imports appointments by practitioner and prevents duplicates", async () => {
  const calls = [];
  const mockFetch = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ pathname: url.pathname, searchParams: url.searchParams, options });

    assert.equal(options.method || "GET", "GET");
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from("test-api-key:").toString("base64")}`);
    assert.equal(options.headers["User-Agent"], "Refine Physio Mobile Test (test@example.com)");

    if (url.pathname === "/v1/patients/8801") {
      return jsonResponse({
        links: { self: "https://mock.cliniko.test/v1/patients/8801" },
        first_name: "Ava",
        last_name: "Taylor",
        date_of_birth: "1944-08-17",
        address_1: "12 Jacaranda Street",
        city: "Carindale",
        state: "QLD",
        post_code: "4152",
        patient_phone_numbers: [
          { phone_type: "Mobile", number: "0400 111 111" },
          { phone_type: "Home", number: "07 3000 1111" }
        ],
        email: "ava.taylor@example.com",
        updated_at: "2026-05-27T02:00:00Z"
      });
    }

    if (url.pathname === "/v1/businesses") {
      return jsonResponse({
        businesses: [
          {
            links: { self: "https://mock.cliniko.test/v1/businesses/401" },
            business_name: "Refine Mobile Test Location",
            display_name: "Mobile Test",
            address_1: "8 Cadbury Street",
            city: "Carseldine",
            state: "QLD",
            post_code: "4034",
            time_zone_identifier: "Australia/Brisbane",
            updated_at: "2026-05-27T01:55:00Z"
          }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/practitioners") {
      return jsonResponse({
        practitioners: [
          {
            links: { self: "https://mock.cliniko.test/v1/practitioners/201" },
            first_name: "Ella",
            last_name: "Mason",
            email: "ella.contractor@example.com",
            phone_number: "0400 000 101",
            updated_at: "2026-05-27T02:05:00Z"
          }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/appointment_types") {
      return jsonResponse({
        appointment_types: [
          {
            links: { self: "https://mock.cliniko.test/v1/appointment_types/301" },
            name: "Initial Physio SAH",
            duration_in_minutes: 60,
            color: "#0b84a5",
            updated_at: "2026-05-27T02:10:00Z"
          }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/individual_appointments") {
      assert.equal(url.searchParams.getAll("q[]").includes("business_id:=401"), true);
      assert.equal(url.searchParams.getAll("q[]").includes("practitioner_id:=201"), true);
      const appointment = {
        links: { self: "https://mock.cliniko.test/v1/individual_appointments/7001" },
        patient: { links: { self: "https://mock.cliniko.test/v1/patients/8801" } },
        practitioner: { links: { self: "https://mock.cliniko.test/v1/practitioners/201" } },
        appointment_type: { links: { self: "https://mock.cliniko.test/v1/appointment_types/301" } },
        business: { links: { self: "https://mock.cliniko.test/v1/businesses/401" } },
        starts_at: "2026-06-03T00:00:00Z",
        ends_at: "2026-06-03T01:00:00Z",
        notes: "Home visit",
        patient_arrived: false,
        did_not_arrive: false,
        cancelled_at: null,
        treatment_note_status: 0,
        created_at: "2026-05-27T02:15:00Z",
        updated_at: "2026-05-27T02:20:00Z"
      };

      return jsonResponse({
        individual_appointments: [appointment, { ...appointment }],
        links: { next: null }
      });
    }

    return jsonResponse({ links: { next: null } });
  };

  await withMockCliniko(mockFetch, async () => {
    const db = blankDb();

    const setup = await syncCliniko(db);
    assert.equal(setup.sync.status, "connected");
    assert.equal(setup.sync.mode, "read_only");
    assert.match(setup.sync.message, /Choose one Cliniko location and one Cliniko practitioner/);
    assert.equal(db.clients.length, 0);
    assert.equal(db.users.length, 1);
    assert.equal(db.appointmentTypes.length, 1);
    assert.equal(db.clinikoLocations.length, 1);
    assert.equal(db.clinikoLocations.filter((location) => location.enabled).length, 0);
    assert.equal(db.users.filter((user) => user.clinikoSyncEnabled).length, 0);
    assert.equal(db.appointments.length, 0);

    updateClinikoLocationEnabled(db, "401", true);
    updateClinikoPractitionerEnabled(db, "201", true);

    const first = await syncCliniko(db);
    assert.equal(first.sync.status, "connected");
    assert.equal(db.clients.length, 1);
    assert.equal(db.clients[0].phone, "0400 111 111");
    assert.equal(db.clinikoLocations.find((location) => location.enabled).clinikoBusinessId, "401");
    assert.equal(db.users.find((user) => user.clinikoSyncEnabled).clinikoPractitionerId, "201");
    assert.equal(db.appointments.length, 1);

    const appointment = db.appointments[0];
    assert.equal(appointment.clinikoId, "7001");
    assert.equal(appointment.syncSource, "cliniko");
    assert.equal(appointment.clientId, "client-cliniko-8801");
    assert.equal(appointment.contractorId, "practitioner-cliniko-201");
    assert.equal(appointment.appointmentType, "Initial Physio SAH");
    assert.equal(appointment.startsAt, "2026-06-03T00:00:00Z");
    assert.equal(appointment.endsAt, "2026-06-03T01:00:00Z");
    assert.equal(appointment.contactNumber, "0400 111 111");
    assert.equal(appointment.clinikoAppointmentNote, "Home visit");
    assert.equal(appointment.syncStatus, "synced");

    await syncCliniko(db);
    assert.equal(db.clients.length, 1);
    assert.equal(db.users.length, 1);
    assert.equal(db.appointmentTypes.length, 1);
    assert.equal(db.appointments.length, 1);

    const appointmentCall = calls.find((call) => call.pathname === "/v1/individual_appointments");
    assert.ok(appointmentCall);
    assert.equal(appointmentCall.searchParams.get("per_page"), "100");
    assert.equal(appointmentCall.searchParams.get("sort"), "starts_at:asc");
    assert.equal(appointmentCall.searchParams.getAll("q[]").length, 4);
    assert.equal(appointmentCall.searchParams.getAll("q[]").includes("business_id:=401"), true);
    assert.equal(appointmentCall.searchParams.getAll("q[]").includes("practitioner_id:=201"), true);
  });
});

test("Cliniko read-only sync updates appointment edits made in Cliniko", async () => {
  let appointmentStart = "2026-06-03T00:00:00Z";
  let appointmentEnd = "2026-06-03T01:00:00Z";
  let appointmentNote = "Admin note: family will open the gate.";
  const mockFetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/v1/businesses") {
      return jsonResponse({
        businesses: [
          { links: { self: "https://mock.cliniko.test/v1/businesses/401" }, business_name: "Mobile Location" }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/practitioners") {
      return jsonResponse({
        practitioners: [
          { links: { self: "https://mock.cliniko.test/v1/practitioners/201" }, first_name: "Ella", last_name: "Mason" }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/appointment_types") {
      return jsonResponse({
        appointment_types: [
          { links: { self: "https://mock.cliniko.test/v1/appointment_types/301" }, name: "Initial Physio SAH" }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/patients/8801") {
      return jsonResponse({
        links: { self: "https://mock.cliniko.test/v1/patients/8801" },
        first_name: "Ava",
        last_name: "Taylor",
        patient_phone_numbers: [{ phone_type: "Mobile", number: "0400 111 111" }]
      });
    }

    if (url.pathname === "/v1/individual_appointments") {
      return jsonResponse({
        individual_appointments: [
          {
            links: { self: "https://mock.cliniko.test/v1/individual_appointments/7001" },
            patient: { links: { self: "https://mock.cliniko.test/v1/patients/8801" } },
            practitioner: { links: { self: "https://mock.cliniko.test/v1/practitioners/201" } },
            appointment_type: { links: { self: "https://mock.cliniko.test/v1/appointment_types/301" } },
            business: { links: { self: "https://mock.cliniko.test/v1/businesses/401" } },
            starts_at: appointmentStart,
            ends_at: appointmentEnd,
            notes: appointmentNote,
            updated_at: appointmentStart
          }
        ],
        links: { next: null }
      });
    }

    return jsonResponse({ links: { next: null } });
  };

  await withMockCliniko(mockFetch, async () => {
    const db = blankDb();
    await syncCliniko(db);
    updateClinikoLocationEnabled(db, "401", true);
    updateClinikoPractitionerEnabled(db, "201", true);

    await syncCliniko(db);
    assert.equal(db.appointments.length, 1);
    assert.equal(db.appointments[0].startsAt, "2026-06-03T00:00:00Z");
    assert.equal(db.appointments[0].clinikoAppointmentNote, "Admin note: family will open the gate.");

    appointmentStart = "2026-06-03T02:00:00Z";
    appointmentEnd = "2026-06-03T03:00:00Z";
    appointmentNote = "Admin note: use side entrance.";
    await syncCliniko(db);

    assert.equal(db.appointments.length, 1);
    assert.equal(db.appointments[0].startsAt, "2026-06-03T02:00:00Z");
    assert.equal(db.appointments[0].endsAt, "2026-06-03T03:00:00Z");
    assert.equal(db.appointments[0].clinikoAppointmentNote, "Admin note: use side entrance.");
    assert.equal(db.appointments[0].syncStatus, "synced");
  });
});

test("Cliniko read-only sync can switch the enabled test location", async () => {
  const appointmentBusinessFilters = [];
  const mockFetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/v1/businesses") {
      return jsonResponse({
        businesses: [
          { links: { self: "https://mock.cliniko.test/v1/businesses/401" }, business_name: "First Location" },
          { links: { self: "https://mock.cliniko.test/v1/businesses/402" }, business_name: "Second Location" }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/patients") return jsonResponse({ patients: [], links: { next: null } });
    if (url.pathname === "/v1/practitioners") {
      return jsonResponse({
        practitioners: [
          { links: { self: "https://mock.cliniko.test/v1/practitioners/201" }, first_name: "Ella", last_name: "Mason" }
        ],
        links: { next: null }
      });
    }
    if (url.pathname === "/v1/appointment_types") return jsonResponse({ appointment_types: [], links: { next: null } });

    if (url.pathname === "/v1/individual_appointments") {
      appointmentBusinessFilters.push(url.searchParams.getAll("q[]").find((value) => value.startsWith("business_id:=")));
      return jsonResponse({ individual_appointments: [], links: { next: null } });
    }

    return jsonResponse({ links: { next: null } });
  };

  await withMockCliniko(mockFetch, async () => {
    const db = blankDb();
    await syncCliniko(db);
    assert.equal(db.clinikoLocations.filter((location) => location.enabled).length, 0);
    const secondLocation = db.clinikoLocations.find((location) => location.clinikoBusinessId === "402");
    const practitioner = db.users.find((user) => user.clinikoPractitionerId === "201");

    const update = updateClinikoLocationEnabled(db, secondLocation.id, true);
    assert.equal(update.location.enabled, true);
    updateClinikoPractitionerEnabled(db, practitioner.id, true);

    await syncCliniko(db);
    assert.equal(db.clinikoLocations.find((location) => location.clinikoBusinessId === "401").enabled, false);
    assert.equal(db.clinikoLocations.find((location) => location.clinikoBusinessId === "402").enabled, true);
    assert.deepEqual(appointmentBusinessFilters, ["business_id:=402"]);
  });
});

test("Cliniko read-only sync requires an enabled practitioner before importing appointments", async () => {
  const appointmentPractitionerFilters = [];
  const mockFetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/v1/businesses") {
      return jsonResponse({
        businesses: [
          { links: { self: "https://mock.cliniko.test/v1/businesses/401" }, business_name: "Mobile Location" }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/practitioners") {
      return jsonResponse({
        practitioners: [
          { links: { self: "https://mock.cliniko.test/v1/practitioners/201" }, first_name: "Ella", last_name: "Mason" },
          { links: { self: "https://mock.cliniko.test/v1/practitioners/202" }, first_name: "Vincent", last_name: "So" }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/appointment_types") return jsonResponse({ appointment_types: [], links: { next: null } });

    if (url.pathname === "/v1/individual_appointments") {
      appointmentPractitionerFilters.push(url.searchParams.getAll("q[]").find((value) => value.startsWith("practitioner_id:=")));
      return jsonResponse({ individual_appointments: [], links: { next: null } });
    }

    return jsonResponse({ links: { next: null } });
  };

  await withMockCliniko(mockFetch, async () => {
    const db = blankDb();
    const setup = await syncCliniko(db);

    assert.equal(setup.sync.status, "connected");
    assert.match(setup.sync.message, /Choose one Cliniko location and one Cliniko practitioner/);
    assert.equal(db.clinikoLocations.filter((location) => location.enabled).length, 0);
    assert.equal(db.users.filter((user) => user.clinikoSyncEnabled).length, 0);
    assert.deepEqual(appointmentPractitionerFilters, []);

    updateClinikoLocationEnabled(db, "401", true);
    await syncCliniko(db);
    assert.deepEqual(appointmentPractitionerFilters, []);

    const practitioner = db.users.find((user) => user.clinikoPractitionerId === "202");
    const update = updateClinikoPractitionerEnabled(db, practitioner.id, true);
    assert.equal(update.practitioner.clinikoSyncEnabled, true);

    await syncCliniko(db);
    assert.deepEqual(appointmentPractitionerFilters, ["practitioner_id:=202"]);
  });
});

test("Cliniko read-only sync honours the fixed Brisbane start date boundary", async () => {
  let appointmentStartFilter = "";
  const mockFetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/v1/businesses") {
      return jsonResponse({
        businesses: [
          { links: { self: "https://mock.cliniko.test/v1/businesses/401" }, business_name: "Mobile Location" }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/practitioners") {
      return jsonResponse({
        practitioners: [
          { links: { self: "https://mock.cliniko.test/v1/practitioners/201" }, first_name: "Ella", last_name: "Mason" }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/appointment_types") return jsonResponse({ appointment_types: [], links: { next: null } });

    if (url.pathname === "/v1/individual_appointments") {
      appointmentStartFilter = url.searchParams.getAll("q[]").find((value) => value.startsWith("starts_at:>="));
      return jsonResponse({ individual_appointments: [], links: { next: null } });
    }

    return jsonResponse({ links: { next: null } });
  };

  await withMockCliniko(mockFetch, async () => {
    const db = blankDb();
    await syncCliniko(db);
    updateClinikoLocationEnabled(db, "401", true);
    updateClinikoPractitionerEnabled(db, "201", true);
    db.clients.push({ id: "client-old", clinikoPatientId: "8801", syncSource: "cliniko" });
    db.appointments.push({
      id: "appt-old",
      clinikoId: "7000",
      syncSource: "cliniko",
      clientId: "client-old",
      startsAt: "2026-05-26T13:59:00.000Z"
    });

    const result = await syncCliniko(db);

    assert.equal(appointmentStartFilter, "starts_at:>=2026-05-26T14:00:00.000Z");
    assert.equal(result.sync.counts.prunedAppointmentsBeforeStart, 1);
    assert.equal(result.sync.counts.prunedPatientsBeforeStart, 1);
    assert.equal(db.appointments.some((appointment) => appointment.id === "appt-old"), false);
    assert.equal(db.clients.some((client) => client.id === "client-old"), false);
  }, {
    CLINIKO_SYNC_START_DATE: "2026-05-27",
    CLINIKO_APPOINTMENT_SYNC_PAST_DAYS: "365"
  });
});

test("Cliniko config keeps appointment and note writes off when report upload is enabled", async () => {
  await withMockCliniko(async () => jsonResponse({ links: { next: null } }), async () => {
    const config = getClinikoConfig();
    assert.equal(config.mode, "report_upload");
    assert.equal(config.writeEnabled, false);
    assert.equal(config.appointmentWriteEnabled, false);
    assert.equal(config.noteSyncEnabled, false);
    assert.equal(config.reportUploadEnabled, true);
  }, {
    CLINIKO_WRITE_ENABLED: "true",
    CLINIKO_NOTE_SYNC_ENABLED: "true",
    CLINIKO_REPORT_UPLOAD_ENABLED: "true"
  });
});

test("Cliniko appointment write-back can be enabled separately from notes", async () => {
  await withMockCliniko(async () => jsonResponse({ links: { next: null } }), async () => {
    const config = getClinikoConfig();
    assert.equal(config.mode, "appointment_write");
    assert.equal(config.writeEnabled, true);
    assert.equal(config.appointmentWriteEnabled, true);
    assert.equal(config.noteSyncEnabled, false);
    assert.equal(config.reportUploadEnabled, false);
  }, {
    CLINIKO_APPOINTMENT_WRITE_ENABLED: "true",
    CLINIKO_NOTE_SYNC_ENABLED: "true",
    CLINIKO_REPORT_UPLOAD_ENABLED: "false"
  });
});

test("Cliniko appointment creation syncs app bookings and creates new patients when needed", async () => {
  const createdPatients = [];
  const createdAppointments = [];
  const mockFetch = async (input, options = {}) => {
    const url = new URL(String(input));

    if (url.pathname === "/v1/patients" && options.method === "POST") {
      const body = JSON.parse(options.body);
      createdPatients.push(body);
      assert.equal(body.first_name, "Ava");
      assert.equal(body.last_name, "Taylor");
      assert.equal(body.patient_phone_numbers[0].phone_type, "Mobile");
      return jsonResponse({
        links: { self: "https://mock.cliniko.test/v1/patients/8801" },
        updated_at: "2026-05-27T03:00:00Z"
      }, 201);
    }

    if (url.pathname === "/v1/individual_appointments" && options.method === "POST") {
      const body = JSON.parse(options.body);
      createdAppointments.push(body);
      assert.equal(body.patient_id, "8801");
      assert.equal(body.practitioner_id, "201");
      assert.equal(body.business_id, "401");
      assert.equal(body.appointment_type_id, "301");
      assert.equal(body.starts_at, "2026-06-03T00:00:00Z");
      assert.equal(body.ends_at, "2026-06-03T01:00:00Z");
      return jsonResponse({
        links: { self: "https://mock.cliniko.test/v1/individual_appointments/7001" },
        patient: { links: { self: "https://mock.cliniko.test/v1/patients/8801" } },
        practitioner: { links: { self: "https://mock.cliniko.test/v1/practitioners/201" } },
        appointment_type: { links: { self: "https://mock.cliniko.test/v1/appointment_types/301" } },
        business: { links: { self: "https://mock.cliniko.test/v1/businesses/401" } },
        starts_at: "2026-06-03T00:00:00Z",
        ends_at: "2026-06-03T01:00:00Z",
        updated_at: "2026-05-27T03:05:00Z"
      }, 201);
    }

    return jsonResponse({ links: { next: null } });
  };

  await withMockCliniko(mockFetch, async () => {
    const db = {
      users: [{ id: "practitioner-1", role: "contractor", name: "Ella Mason", clinikoPractitionerId: "201" }],
      clients: [{ id: "client-1", name: "Ava Taylor", phone: "0400 111 111", address: "12 Jacaranda Street" }],
      appointments: [],
      appointmentTypes: [{ id: "type-1", name: "Initial Physiotherapy Assessment SAH", clinikoAppointmentTypeId: "301" }],
      clinikoLocations: [{ id: "location-1", clinikoBusinessId: "401", enabled: true }],
      clinikoSyncLogs: [],
      syncErrors: []
    };
    const appointment = {
      id: "appt-1",
      clientId: "client-1",
      contractorId: "practitioner-1",
      appointmentType: "Initial Physiotherapy SAH",
      startsAt: "2026-06-03T00:00:00Z",
      endsAt: "2026-06-03T01:00:00Z",
      reasonForReferral: "Home visit"
    };

    const result = await createClinikoAppointmentFromApp(db, appointment);

    assert.equal(result.status, "synced");
    assert.equal(createdPatients.length, 1);
    assert.equal(createdAppointments.length, 1);
    assert.equal(db.clients[0].clinikoPatientId, "8801");
    assert.equal(appointment.clinikoId, "7001");
    assert.equal(appointment.syncStatus, "synced");
    assert.equal(appointment.syncSource, "cliniko");
    assert.equal(db.clinikoSyncLogs.some((log) => log.operation === "patient_create"), true);
    assert.equal(db.clinikoSyncLogs.some((log) => log.operation === "appointment_create"), true);
  }, {
    CLINIKO_APPOINTMENT_CREATE_ENABLED: "true",
    CLINIKO_PATIENT_CREATE_ENABLED: "true"
  });
});

test("Cliniko report upload creates the correct patient file and prevents duplicates", async () => {
  const createdAttachments = [];
  let existingAttachmentAlreadyUploaded = false;
  const filename = "Ava Taylor - Initial Physiotherapy Assessment Report - 2026-06-03 - Ella Mason.pdf";
  const mockFetch = async (input, options = {}) => {
    const url = new URL(String(input));

    if (url.hostname === "mock-s3.cliniko.test") {
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("file").name, "Ava_Taylor_-_Initial_Physiotherapy_Assessment_Report_-_2026-06-03_-_Ella_Mason.pdf");
      return {
        ok: true,
        status: 201,
        headers: { get: () => "application/xml" },
        async json() {
          return {};
        },
        async text() {
          return "<PostResponse><Key>123/patients/8801/attachments/temp/report.pdf</Key></PostResponse>";
        }
      };
    }

    if (url.pathname === "/v1/patient_attachments" && (options.method || "GET") === "GET") {
      assert.equal(url.searchParams.getAll("q[]").includes("patient_id:=8801"), true);
      assert.equal(url.searchParams.getAll("q[]").includes(`filename:=${filename}`), true);
      return jsonResponse({
        patient_attachments: existingAttachmentAlreadyUploaded
          ? [
              {
                id: "attachment-991",
                filename,
                processing_completed: true,
                archived_at: null
              }
            ]
          : [],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/patients/8801/attachment_presigned_post") {
      return jsonResponse({
        url: "https://mock-s3.cliniko.test/",
        fields: {
          key: "123/patients/8801/attachments/temp/${filename}",
          policy: "test-policy",
          success_action_status: "201",
          "x-amz-algorithm": "AWS4-HMAC-SHA256",
          "x-amz-credential": "test",
          "x-amz-signature": "test"
        }
      });
    }

    if (url.pathname === "/v1/patient_attachments" && options.method === "POST") {
      const body = JSON.parse(options.body);
      createdAttachments.push(body);
      assert.equal(body.patient_id, "8801");
      assert.equal(body.filename, filename);
      assert.equal(body.description, "Refine Physio Mobile report: Initial Physiotherapy Assessment Report");
      assert.match(body.upload_url, /mock-s3\.cliniko\.test/);
      existingAttachmentAlreadyUploaded = true;
      return jsonResponse({
        id: "attachment-991",
        filename,
        processing_completed: true
      }, 201);
    }

    return jsonResponse({ links: { next: null } });
  };

  await withMockCliniko(mockFetch, async () => {
    const db = {
      users: [],
      clients: [{ id: "client-1", name: "Ava Taylor", clinikoPatientId: "8801" }],
      appointments: [],
      reports: [],
      clinikoSyncLogs: [],
      syncErrors: []
    };
    const report = {
      id: "report-1",
      clientId: "client-1",
      type: "Initial Physiotherapy Assessment Report",
      status: "ready_for_admin"
    };

    const result = await uploadReportPdfToCliniko(db, report, Buffer.from("%PDF-report"), filename);
    assert.equal(result.status, "synced");
    assert.equal(result.skipped, false);
    assert.equal(createdAttachments.length, 1);
    assert.equal(report.clinikoUploadStatus, "synced");
    assert.equal(report.clinikoAttachmentFilename, filename);

    const duplicate = await uploadReportPdfToCliniko(db, { ...report, clinikoAttachmentId: "", clinikoAttachmentProcessingCompleted: false }, Buffer.from("%PDF-report"), filename);
    assert.equal(duplicate.status, "synced");
    assert.equal(duplicate.duplicate, true);
    assert.equal(createdAttachments.length, 1);
  }, {
    CLINIKO_REPORT_UPLOAD_ENABLED: "true"
  });
});

test("Cliniko completed treatment note upload creates a patient file with appointment date notes patient filename", async () => {
  const createdAttachments = [];
  const mockFetch = async (input, options = {}) => {
    const url = new URL(String(input));

    if (url.hostname === "mock-s3.cliniko.test") {
      assert.equal(options.method, "POST");
      assert.equal(options.body.get("file").name, "2026-06-03_-_notes_-_Ava_Taylor.pdf");
      return {
        ok: true,
        status: 201,
        headers: { get: () => "application/xml" },
        async json() {
          return {};
        },
        async text() {
          return "<PostResponse><Key>123/patients/8801/attachments/temp/note.pdf</Key></PostResponse>";
        }
      };
    }

    if (url.pathname === "/v1/patient_attachments" && (options.method || "GET") === "GET") {
      assert.equal(url.searchParams.getAll("q[]").includes("patient_id:=8801"), true);
      assert.equal(url.searchParams.getAll("q[]").includes("filename:=2026-06-03 - notes - Ava Taylor.pdf"), true);
      return jsonResponse({
        patient_attachments: [
          {
            id: "stale-attachment",
            filename: "2026-06-03 - notes - Ava Taylor.pdf",
            processing_completed: false,
            archived_at: null
          }
        ],
        links: { next: null }
      });
    }

    if (url.pathname === "/v1/patients/8801/attachment_presigned_post") {
      return jsonResponse({
        url: "https://mock-s3.cliniko.test/",
        fields: {
          key: "123/patients/8801/attachments/temp/${filename}",
          policy: "test-policy",
          success_action_status: "201",
          "x-amz-algorithm": "AWS4-HMAC-SHA256",
          "x-amz-credential": "test",
          "x-amz-signature": "test"
        }
      });
    }

    if (url.pathname === "/v1/patient_attachments" && options.method === "POST") {
      const body = JSON.parse(options.body);
      createdAttachments.push(body);
      assert.equal(body.patient_id, "8801");
      assert.equal(body.filename, "2026-06-03 - notes - Ava Taylor.pdf");
      assert.equal(body.description, "Refine Physio Mobile treatment note: 2026-06-03");
      assert.match(body.upload_url, /mock-s3\.cliniko\.test/);
      return jsonResponse({
        id: "attachment-991",
        filename: body.filename,
        processing_completed: true
      }, 201);
    }

    return jsonResponse({ links: { next: null } });
  };

  await withMockCliniko(mockFetch, async () => {
    const db = {
      clients: [{ id: "client-1", name: "Ava Taylor", clinikoPatientId: "8801" }],
      appointments: [{ id: "appt-1", clientId: "client-1", startsAt: "2026-06-03T00:00:00Z", appointmentType: "Subsequent Physio SAH" }],
      clinikoSyncLogs: [],
      syncErrors: []
    };
    const note = {
      id: "note-1",
      appointmentId: "appt-1",
      clientId: "client-1",
      contractorId: "practitioner-1",
      status: "signed",
      fields: { subjective: "Doing well", treatment: "Home exercise review" }
    };

    const filename = treatmentNotePdfFilename("2026-06-03", "Ava Taylor");
    const result = await uploadTreatmentNotePdfToCliniko(db, note, Buffer.from("%PDF-test"), filename);

    assert.equal(result.status, "synced");
    assert.equal(createdAttachments.length, 1);
    assert.equal(note.clinikoUploadStatus, "synced");
    assert.equal(note.clinikoAttachmentId, "attachment-991");
    assert.equal(note.clinikoAttachmentFilename, "2026-06-03 - notes - Ava Taylor.pdf");
    assert.equal(db.clinikoSyncLogs.at(-1).operation, "note_file_upload");
  }, {
    CLINIKO_NOTE_UPLOAD_ENABLED: "true"
  });
});

test("Cliniko read-only sync records clear errors", async () => {
  const mockFetch = async () => jsonResponse({ message: "Unauthorized test response" }, 401);

  await withMockCliniko(mockFetch, async () => {
    const db = blankDb();
    const result = await syncCliniko(db);

    assert.equal(result.sync.status, "failed");
    assert.match(result.sync.message, /Cliniko 401|Unauthorized/);
    assert.equal(db.syncErrors.length, 1);
    assert.equal(db.syncErrors[0].operation, "read_sync");
    assert.equal(db.clinikoSyncLogs.at(-1).status, "failed");
  });
});
