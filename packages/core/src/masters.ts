import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  organizations,
  departments,
  employees,
  locations,
  devices,
  users,
  roles,
  userRoles,
  type DbExecutor,
} from "@platform/database";
import { writeAudit } from "./audit";
import { NotFoundError, ValidationError } from "./errors";
import type { RequestMeta } from "./context";

type Actor = { userId: string } & RequestMeta;

// --- Organizations / departments ------------------------------------------
export async function listOrganizations(db: DbExecutor) {
  return db.select().from(organizations).orderBy(asc(organizations.code));
}

export async function listDepartments(db: DbExecutor, organizationId?: string) {
  const q = db.select().from(departments).orderBy(asc(departments.code));
  return organizationId ? q.where(eq(departments.organizationId, organizationId)) : q;
}

export async function upsertOrganization(
  db: DbExecutor,
  input: { id?: string; code: string; name: string; kind?: string; parentId?: string | null; active?: boolean },
  actor: Actor,
) {
  if (!input.code.trim() || !input.name.trim()) throw new ValidationError("コードと名称は必須です");
  const values = { code: input.code.trim(), name: input.name.trim(), kind: input.kind ?? "corporation", parentId: input.parentId ?? null, active: input.active ?? true, updatedAt: new Date() };
  const [row] = input.id
    ? await db.update(organizations).set(values).where(eq(organizations.id, input.id)).returning()
    : await db.insert(organizations).values(values).returning();
  if (!row) throw new NotFoundError("組織");
  await writeAudit(db, { ...actor, actorUserId: actor.userId, action: "organization.updated", targetType: "organization", targetId: row.id, details: values });
  return row;
}

export async function upsertDepartment(
  db: DbExecutor,
  input: { id?: string; organizationId: string; code: string; name: string; parentId?: string | null; active?: boolean },
  actor: Actor,
) {
  if (!input.code.trim() || !input.name.trim()) throw new ValidationError("コードと名称は必須です");
  const values = { organizationId: input.organizationId, code: input.code.trim(), name: input.name.trim(), parentId: input.parentId ?? null, active: input.active ?? true, updatedAt: new Date() };
  const [row] = input.id
    ? await db.update(departments).set(values).where(eq(departments.id, input.id)).returning()
    : await db.insert(departments).values(values).returning();
  if (!row) throw new NotFoundError("部署");
  await writeAudit(db, { ...actor, actorUserId: actor.userId, action: "organization.updated", targetType: "department", targetId: row.id, details: values });
  return row;
}

// --- Employees ---------------------------------------------------------------
export async function listEmployees(db: DbExecutor, filter: { departmentId?: string; organizationId?: string; includeRetired?: boolean } = {}) {
  const conds = [];
  if (filter.departmentId) conds.push(eq(employees.departmentId, filter.departmentId));
  if (filter.organizationId) conds.push(eq(employees.organizationId, filter.organizationId));
  if (!filter.includeRetired) conds.push(sql`${employees.status} <> 'retired'`);
  return db
    .select({
      employee: employees,
      departmentName: departments.name,
      organizationName: organizations.name,
      locationName: locations.name,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(organizations, eq(organizations.id, employees.organizationId))
    .leftJoin(locations, eq(locations.id, employees.primaryLocationId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(employees.employeeNumber));
}

export async function getEmployee(db: DbExecutor, id: string) {
  const [row] = await db.select().from(employees).where(eq(employees.id, id));
  if (!row) throw new NotFoundError("職員");
  return row;
}

export interface EmployeeInput {
  id?: string;
  employeeNumber: string;
  name: string;
  nameKana?: string | null;
  organizationId: string;
  departmentId?: string | null;
  primaryLocationId?: string | null;
  employmentType?: string;
  hiredOn?: string | null;
  retiredOn?: string | null;
  status?: "active" | "on_leave" | "retired";
}

export async function upsertEmployee(db: DbExecutor, input: EmployeeInput, actor: Actor) {
  if (!input.employeeNumber.trim() || !input.name.trim()) throw new ValidationError("職員番号と氏名は必須です");
  const values = {
    employeeNumber: input.employeeNumber.trim(),
    name: input.name.trim(),
    nameKana: input.nameKana?.trim() || null,
    organizationId: input.organizationId,
    departmentId: input.departmentId || null,
    primaryLocationId: input.primaryLocationId || null,
    employmentType: input.employmentType ?? "full_time",
    hiredOn: input.hiredOn || null,
    retiredOn: input.retiredOn || null,
    status: input.status ?? "active",
    updatedAt: new Date(),
  };
  const [row] = input.id
    ? await db.update(employees).set(values).where(eq(employees.id, input.id)).returning()
    : await db.insert(employees).values(values).returning();
  if (!row) throw new NotFoundError("職員");
  await writeAudit(db, {
    ...actor,
    actorUserId: actor.userId,
    action: input.id ? "employee.updated" : "employee.created",
    targetType: "employee",
    targetId: row.id,
    details: values,
  });
  return row;
}

// --- Locations ---------------------------------------------------------------
export async function listLocations(db: DbExecutor, opts: { activeOnly?: boolean } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const q = db.select().from(locations).orderBy(asc(locations.code));
  if (!opts.activeOnly) return q;
  return q.where(
    and(
      eq(locations.punchAllowed, true),
      or(isNull(locations.validFrom), sql`${locations.validFrom} <= ${today}`),
      or(isNull(locations.validTo), sql`${locations.validTo} >= ${today}`),
    ),
  );
}

export interface LocationInput {
  id?: string;
  code: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  validFrom?: string | null;
  validTo?: string | null;
  punchAllowed?: boolean;
  organizationId?: string | null;
}

export async function upsertLocation(db: DbExecutor, input: LocationInput, actor: Actor) {
  if (!input.code.trim() || !input.name.trim()) throw new ValidationError("拠点コードと拠点名は必須です");
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) {
    throw new ValidationError("緯度・経度が不正です");
  }
  if (!Number.isInteger(input.radiusMeters) || input.radiusMeters < 10 || input.radiusMeters > 50_000) {
    throw new ValidationError("GPS許容半径は 10〜50000m で指定してください");
  }
  const values = {
    code: input.code.trim(),
    name: input.name.trim(),
    address: input.address?.trim() || null,
    latitude: input.latitude,
    longitude: input.longitude,
    radiusMeters: input.radiusMeters,
    validFrom: input.validFrom || null,
    validTo: input.validTo || null,
    punchAllowed: input.punchAllowed ?? true,
    organizationId: input.organizationId || null,
    updatedAt: new Date(),
  };
  const [row] = input.id
    ? await db.update(locations).set(values).where(eq(locations.id, input.id)).returning()
    : await db.insert(locations).values(values).returning();
  if (!row) throw new NotFoundError("拠点");
  await writeAudit(db, {
    ...actor,
    actorUserId: actor.userId,
    action: input.id ? "location.updated" : "location.created",
    targetType: "location",
    targetId: row.id,
    details: values,
  });
  return row;
}

// --- Devices -----------------------------------------------------------------
export interface DeviceInfo {
  deviceKey: string;
  os?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  userAgent?: string | null;
}

/**
 * Find or register the device used for a punch (§12). Multiple devices per
 * employee are allowed. New devices start as `pending` unless configured.
 */
export async function touchDevice(
  db: DbExecutor,
  employeeId: string,
  info: DeviceInfo,
  opts: { autoRegister: boolean; defaultApproval: "pending" | "approved" },
) {
  const key = info.deviceKey.trim().slice(0, 128);
  if (!key) return { device: null, isNew: false };
  const [existing] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.employeeId, employeeId), eq(devices.deviceKey, key)));
  if (existing) {
    const [updated] = await db
      .update(devices)
      .set({
        lastSeenAt: new Date(),
        os: info.os ?? existing.os,
        osVersion: info.osVersion ?? existing.osVersion,
        appVersion: info.appVersion ?? existing.appVersion,
        userAgent: info.userAgent ? info.userAgent.slice(0, 512) : existing.userAgent,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, existing.id))
      .returning();
    return { device: updated!, isNew: false };
  }
  if (!opts.autoRegister) return { device: null, isNew: true };
  const [created] = await db
    .insert(devices)
    .values({
      employeeId,
      deviceKey: key,
      os: info.os ?? null,
      osVersion: info.osVersion ?? null,
      appVersion: info.appVersion ?? null,
      userAgent: info.userAgent ? info.userAgent.slice(0, 512) : null,
      approvalStatus: opts.defaultApproval,
    })
    .returning();
  return { device: created!, isNew: true };
}

export async function listDevices(db: DbExecutor, filter: { employeeId?: string } = {}) {
  return db
    .select({ device: devices, employeeName: employees.name, employeeNumber: employees.employeeNumber })
    .from(devices)
    .innerJoin(employees, eq(employees.id, devices.employeeId))
    .where(filter.employeeId ? eq(devices.employeeId, filter.employeeId) : undefined)
    .orderBy(asc(devices.lastSeenAt));
}

export async function updateDevice(
  db: DbExecutor,
  id: string,
  patch: { approvalStatus?: "pending" | "approved" | "rejected"; disabled?: boolean; label?: string | null },
  actor: Actor,
) {
  const [row] = await db.update(devices).set({ ...patch, updatedAt: new Date() }).where(eq(devices.id, id)).returning();
  if (!row) throw new NotFoundError("端末");
  await writeAudit(db, { ...actor, actorUserId: actor.userId, action: "device.updated", targetType: "device", targetId: id, details: patch });
  return row;
}

// --- Users & roles -------------------------------------------------------------
export async function listUsersWithRoles(db: DbExecutor) {
  const rows = await db
    .select({ user: users, employeeName: employees.name, employeeNumber: employees.employeeNumber })
    .from(users)
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .orderBy(asc(users.loginId));
  const roleRows = await db
    .select({ userId: userRoles.userId, code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId));
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.code]);
  return rows.map((r) => ({ ...r, roles: rolesByUser.get(r.user.id) ?? [] }));
}

export async function setUserRoles(db: DbExecutor, userId: string, roleCodes: string[], actor: Actor) {
  const allRoles = await db.select().from(roles);
  const wanted = allRoles.filter((r) => roleCodes.includes(r.code));
  await db.delete(userRoles).where(eq(userRoles.userId, userId));
  for (const r of wanted) {
    await db.insert(userRoles).values({ userId, roleId: r.id, grantedBy: actor.userId });
  }
  await writeAudit(db, { ...actor, actorUserId: actor.userId, action: "user.role_changed", targetType: "user", targetId: userId, details: { roles: wanted.map((r) => r.code) } });
}
