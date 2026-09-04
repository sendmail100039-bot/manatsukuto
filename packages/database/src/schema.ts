/**
 * Company Platform - database schema (PostgreSQL / Drizzle ORM)
 *
 * Sections mirror the requirements document (v0.4, §29):
 *   Core       : organizations, departments, employees, users, locations, devices, roles, permissions, user_roles
 *   Attendance : attendance_records, attendance_events, attendance_requests, attendance_approvals
 *   Security   : security_events, risk_assessments, device_checks, location_checks
 *   System     : audit_logs, system_settings
 * Auth support: user_credentials, user_mfa, user_sessions, login_attempts, idempotency_keys
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  date,
  bigserial,
  primaryKey,
  uniqueIndex,
  index,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const employeeStatusEnum = pgEnum("employee_status", ["active", "on_leave", "retired"]);
export const userStatusEnum = pgEnum("user_status", ["active", "locked", "disabled"]);
export const authMethodEnum = pgEnum("auth_method", ["password", "passkey", "external"]);
export const deviceApprovalEnum = pgEnum("device_approval", ["pending", "approved", "rejected"]);
export const attendanceEventTypeEnum = pgEnum("attendance_event_type", ["clock_in", "clock_out", "break_start", "break_end"]);
export const attendanceRecordStatusEnum = pgEnum("attendance_record_status", [
  "open",
  "closed",
  "superseded",
]);
export const attendanceRequestTypeEnum = pgEnum("attendance_request_type", [
  "correct_time",
  "add_missing",
  "cancel_record",
]);
export const attendanceRequestStatusEnum = pgEnum("attendance_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const approvalDecisionEnum = pgEnum("approval_decision", ["approved", "rejected"]);
export const riskLevelEnum = pgEnum("risk_level", ["NORMAL", "REVIEW", "HIGH_RISK"]);
export const securityEventStatusEnum = pgEnum("security_event_status", [
  "open",
  "reviewed",
  "dismissed",
  "confirmed",
]);
export const securitySeverityEnum = pgEnum("security_severity", ["info", "low", "medium", "high"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("corporation"), // corporation | office
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("organizations_code_idx").on(t.code)],
);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => departments.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("departments_org_code_idx").on(t.organizationId, t.code)],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    radiusMeters: integer("radius_meters").notNull().default(200),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    punchAllowed: boolean("punch_allowed").notNull().default(true),
    /** Rotating site code (dynamic QR) - encrypted TOTP secret; null = feature disabled for this site. */
    siteCodeSecret: text("site_code_secret"),
    siteCodeRequired: boolean("site_code_required").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("locations_code_idx").on(t.code)],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeNumber: text("employee_number").notNull(),
    name: text("name").notNull(),
    nameKana: text("name_kana"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    departmentId: uuid("department_id").references(() => departments.id),
    primaryLocationId: uuid("primary_location_id").references(() => locations.id),
    employmentType: text("employment_type").notNull().default("full_time"),
    hiredOn: date("hired_on"),
    retiredOn: date("retired_on"),
    status: employeeStatusEnum("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("employees_number_idx").on(t.employeeNumber),
    index("employees_department_idx").on(t.departmentId),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references(() => employees.id),
    loginId: text("login_id").notNull(),
    email: text("email"),
    status: userStatusEnum("status").notNull().default("active"),
    authMethod: authMethodEnum("auth_method").notNull().default("password"),
    mfaRequired: boolean("mfa_required").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_login_id_idx").on(t.loginId),
    uniqueIndex("users_employee_id_idx").on(t.employeeId),
  ],
);

export const userCredentials = pgTable("user_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }).notNull().defaultNow(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

export const userMfa = pgTable("user_mfa", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // TOTP secret encrypted with APP_SECRET (AES-256-GCM); never stored in plain text.
  secretEncrypted: text("secret_encrypted").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  recoveryCodesHash: jsonb("recovery_codes_hash").$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const userSessions = pgTable(
  "user_sessions",
  {
    id: text("id").primaryKey(), // sha256 of the opaque cookie token
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("user_sessions_user_idx").on(t.userId), index("user_sessions_expires_idx").on(t.expiresAt)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    loginId: text("login_id").notNull(),
    ipAddress: text("ip_address"),
    success: boolean("success").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_login_idx").on(t.loginId, t.createdAt), index("login_attempts_ip_idx").on(t.ipAddress, t.createdAt)],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    deviceKey: text("device_key").notNull(), // stable client-generated identifier
    os: text("os"),
    osVersion: text("os_version"),
    appVersion: text("app_version"),
    userAgent: text("user_agent"),
    label: text("label"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    approvalStatus: deviceApprovalEnum("approval_status").notNull().default("pending"),
    disabled: boolean("disabled").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("devices_employee_key_idx").on(t.employeeId, t.deviceKey)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_code_idx").on(t.code)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    description: text("description"),
  },
  (t) => [uniqueIndex("permissions_code_idx").on(t.code)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    deviceId: uuid("device_id").references(() => devices.id),
    type: attendanceEventTypeEnum("type").notNull(),
    // Official time = server time. Client time is auxiliary only.
    serverTime: timestamp("server_time", { withTimezone: true }).notNull().defaultNow(),
    clientTime: timestamp("client_time", { withTimezone: true }),
    clientSkewSeconds: integer("client_skew_seconds"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    accuracyMeters: doublePrecision("accuracy_meters"),
    speedMps: doublePrecision("speed_mps"),
    heading: doublePrecision("heading"),
    altitude: doublePrecision("altitude"),
    gpsCapturedAt: timestamp("gps_captured_at", { withTimezone: true }),
    locationId: uuid("location_id").references(() => locations.id),
    distanceMeters: doublePrecision("distance_meters"),
    withinRange: boolean("within_range"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id").notNull(), // idempotency / replay protection
    siteCodeVerified: boolean("site_code_verified"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attendance_events_request_idx").on(t.requestId),
    index("attendance_events_employee_time_idx").on(t.employeeId, t.serverTime),
  ],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    workDate: date("work_date").notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    clockInEventId: uuid("clock_in_event_id").references(() => attendanceEvents.id),
    clockOutEventId: uuid("clock_out_event_id").references(() => attendanceEvents.id),
    clockInAt: timestamp("clock_in_at", { withTimezone: true }),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    status: attendanceRecordStatusEnum("status").notNull().default("open"),
    breakMinutes: integer("break_minutes").notNull().default(0),
    // Version chain: records are never overwritten. A correction creates a new
    // record and marks the previous one as superseded.
    version: integer("version").notNull().default(1),
    supersedesRecordId: uuid("supersedes_record_id").references((): AnyPgColumn => attendanceRecords.id),
    supersededByRecordId: uuid("superseded_by_record_id").references((): AnyPgColumn => attendanceRecords.id),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("attendance_records_employee_date_idx").on(t.employeeId, t.workDate)],
);

export const attendanceBreaks = pgTable(
  "attendance_breaks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => attendanceRecords.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    startEventId: uuid("start_event_id").references(() => attendanceEvents.id),
    endEventId: uuid("end_event_id").references(() => attendanceEvents.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attendance_breaks_record_idx").on(t.recordId)],
);

export const attendanceRequests = pgTable(
  "attendance_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    recordId: uuid("record_id").references(() => attendanceRecords.id),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    type: attendanceRequestTypeEnum("type").notNull(),
    workDate: date("work_date").notNull(),
    requestedClockInAt: timestamp("requested_clock_in_at", { withTimezone: true }),
    requestedClockOutAt: timestamp("requested_clock_out_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    status: attendanceRequestStatusEnum("status").notNull().default("pending"),
    ...timestamps,
  },
  (t) => [index("attendance_requests_employee_idx").on(t.employeeId, t.status)],
);

export const attendanceApprovals = pgTable("attendance_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => attendanceRequests.id),
  approverUserId: uuid("approver_user_id")
    .notNull()
    .references(() => users.id),
  decision: approvalDecisionEnum("decision").notNull(),
  comment: text("comment"),
  originalRecordSnapshot: jsonb("original_record_snapshot"),
  newRecordId: uuid("new_record_id").references(() => attendanceRecords.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------
export const riskAssessments = pgTable(
  "risk_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attendanceEventId: uuid("attendance_event_id")
      .notNull()
      .references(() => attendanceEvents.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    score: integer("score").notNull(),
    level: riskLevelEnum("level").notNull(),
    reasons: jsonb("reasons").$type<{ code: string; points: number; detail?: string }[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("risk_assessments_event_idx").on(t.attendanceEventId),
    index("risk_assessments_level_idx").on(t.level, t.createdAt),
  ],
);

export const locationChecks = pgTable("location_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  attendanceEventId: uuid("attendance_event_id")
    .notNull()
    .references(() => attendanceEvents.id),
  locationId: uuid("location_id").references(() => locations.id),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  accuracyMeters: doublePrecision("accuracy_meters"),
  distanceMeters: doublePrecision("distance_meters"),
  radiusMeters: integer("radius_meters"),
  withinRange: boolean("within_range"),
  gpsMissing: boolean("gps_missing").notNull().default(false),
  previousEventId: uuid("previous_event_id").references(() => attendanceEvents.id),
  previousDistanceMeters: doublePrecision("previous_distance_meters"),
  elapsedSeconds: integer("elapsed_seconds"),
  speedKmh: doublePrecision("speed_kmh"),
  impossibleTravel: boolean("impossible_travel").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deviceChecks = pgTable("device_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  attendanceEventId: uuid("attendance_event_id")
    .notNull()
    .references(() => attendanceEvents.id),
  deviceId: uuid("device_id").references(() => devices.id),
  registered: boolean("registered").notNull().default(false),
  approved: boolean("approved").notNull().default(false),
  newDevice: boolean("new_device").notNull().default(false),
  mockLocation: boolean("mock_location"),
  integrity: jsonb("integrity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references(() => employees.id),
    userId: uuid("user_id").references(() => users.id),
    attendanceEventId: uuid("attendance_event_id").references(() => attendanceEvents.id),
    riskAssessmentId: uuid("risk_assessment_id").references(() => riskAssessments.id),
    type: text("type").notNull(),
    severity: securitySeverityEnum("severity").notNull().default("low"),
    details: jsonb("details"),
    status: securityEventStatusEnum("status").notNull().default("open"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_events_status_idx").on(t.status, t.createdAt), index("security_events_employee_idx").on(t.employeeId)],
);

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    actorEmployeeId: uuid("actor_employee_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    details: jsonb("details"),
  },
  (t) => [index("audit_logs_time_idx").on(t.occurredAt), index("audit_logs_actor_idx").on(t.actorUserId), index("audit_logs_action_idx").on(t.action)],
);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedByUserId: uuid("updated_by_user_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    userId: uuid("user_id").notNull(),
    scope: text("scope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idempotency_keys_expires_idx").on(t.expiresAt)],
);

export const schemaVersionMarker = sql`1`;
