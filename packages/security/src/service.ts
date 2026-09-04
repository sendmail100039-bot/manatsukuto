import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  attendanceEvents,
  deviceChecks,
  devices,
  employees,
  locationChecks,
  locations,
  riskAssessments,
  securityEvents,
  users,
  type DbExecutor,
} from "@platform/database";
import { NotFoundError, writeAudit, type RequestMeta } from "@platform/core";
import type { RiskAssessmentResult } from "./risk";
import { severityForAssessment } from "./risk";
import type { GeofenceResult } from "./geo";
import type { ImpossibleTravelResult } from "./travel";

export interface PersistAssessmentInput {
  attendanceEventId: string;
  employeeId: string;
  userId: string;
  assessment: RiskAssessmentResult;
  location: {
    locationId: string | null;
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    geofence: GeofenceResult | null;
    gpsMissing: boolean;
    previousEventId: string | null;
    travel: ImpossibleTravelResult | null;
  };
  device: {
    deviceId: string | null;
    registered: boolean;
    approved: boolean;
    newDevice: boolean;
    mockLocation: boolean | null;
    integrity: unknown;
  };
  meta: RequestMeta;
}

/** Persist risk assessment + supporting checks + security event (if any). */
export async function persistAssessment(db: DbExecutor, input: PersistAssessmentInput) {
  const [assessment] = await db
    .insert(riskAssessments)
    .values({
      attendanceEventId: input.attendanceEventId,
      employeeId: input.employeeId,
      score: input.assessment.score,
      level: input.assessment.level,
      reasons: input.assessment.reasons,
    })
    .returning();

  await db.insert(locationChecks).values({
    attendanceEventId: input.attendanceEventId,
    locationId: input.location.locationId,
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    accuracyMeters: input.location.accuracyMeters,
    distanceMeters: input.location.geofence?.distanceMeters ?? null,
    radiusMeters: input.location.geofence?.radiusMeters ?? null,
    withinRange: input.location.geofence?.withinRange ?? null,
    gpsMissing: input.location.gpsMissing,
    previousEventId: input.location.previousEventId,
    previousDistanceMeters: input.location.travel?.distanceMeters ?? null,
    elapsedSeconds: input.location.travel?.elapsedSeconds ?? null,
    speedKmh: input.location.travel ? Math.min(input.location.travel.speedKmh, 1e9) : null,
    impossibleTravel: input.location.travel?.impossible ?? false,
  });

  await db.insert(deviceChecks).values({
    attendanceEventId: input.attendanceEventId,
    deviceId: input.device.deviceId,
    registered: input.device.registered,
    approved: input.device.approved,
    newDevice: input.device.newDevice,
    mockLocation: input.device.mockLocation,
    integrity: input.device.integrity ?? null,
  });

  let securityEventId: string | null = null;
  if (input.assessment.level !== "NORMAL") {
    const severity = severityForAssessment(input.assessment);
    const type = input.assessment.reasons.some((r) => r.code === "IMPOSSIBLE_TRAVEL")
      ? "IMPOSSIBLE_TRAVEL"
      : input.assessment.reasons.some((r) => r.code === "MOCK_LOCATION")
        ? "MOCK_LOCATION"
        : input.assessment.reasons.some((r) => r.code.includes("LOCATION") || r.code.startsWith("GPS"))
          ? "GPS_ANOMALY"
          : "DEVICE_ANOMALY";
    const [ev] = await db
      .insert(securityEvents)
      .values({
        employeeId: input.employeeId,
        userId: input.userId,
        attendanceEventId: input.attendanceEventId,
        riskAssessmentId: assessment!.id,
        type,
        severity,
        details: { score: input.assessment.score, level: input.assessment.level, reasons: input.assessment.reasons },
      })
      .returning();
    securityEventId = ev!.id;
    await writeAudit(db, {
      ...input.meta,
      actorUserId: input.userId,
      actorEmployeeId: input.employeeId,
      action: type === "GPS_ANOMALY" || type === "IMPOSSIBLE_TRAVEL" ? "security.gps_anomaly" : "security.event_created",
      targetType: "security_event",
      targetId: ev!.id,
      details: { type, severity, score: input.assessment.score },
    });
  }
  return { assessmentId: assessment!.id, securityEventId };
}

/** Head-office dashboard counts for a day (§24). */
export async function dashboardSummary(db: DbExecutor, dayStart: Date, dayEnd: Date) {
  const rows = await db
    .select({ level: riskAssessments.level, count: sql<number>`count(*)::int` })
    .from(riskAssessments)
    .where(and(gte(riskAssessments.createdAt, dayStart), lt(riskAssessments.createdAt, dayEnd)))
    .groupBy(riskAssessments.level);
  const summary = { NORMAL: 0, REVIEW: 0, HIGH_RISK: 0, total: 0 };
  for (const r of rows) {
    summary[r.level] = r.count;
    summary.total += r.count;
  }
  const [open] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(securityEvents)
    .where(eq(securityEvents.status, "open"));
  return { ...summary, openEvents: open?.count ?? 0 };
}

export async function listSecurityEvents(db: DbExecutor, filter: { status?: "open" | "reviewed" | "dismissed" | "confirmed"; limit?: number } = {}) {
  return db
    .select({
      event: securityEvents,
      employeeName: employees.name,
      employeeNumber: employees.employeeNumber,
      assessment: riskAssessments,
      attendanceEvent: attendanceEvents,
    })
    .from(securityEvents)
    .leftJoin(employees, eq(employees.id, securityEvents.employeeId))
    .leftJoin(riskAssessments, eq(riskAssessments.id, securityEvents.riskAssessmentId))
    .leftJoin(attendanceEvents, eq(attendanceEvents.id, securityEvents.attendanceEventId))
    .where(filter.status ? eq(securityEvents.status, filter.status) : undefined)
    .orderBy(desc(securityEvents.createdAt))
    .limit(filter.limit ?? 200);
}

/** Full detail for one event; viewing is itself audited (§34). */
export async function getSecurityEventDetail(db: DbExecutor, id: string, viewer: { userId: string } & RequestMeta) {
  const [row] = await db
    .select({
      event: securityEvents,
      employee: employees,
      assessment: riskAssessments,
      attendanceEvent: attendanceEvents,
      location: locations,
      locationCheck: locationChecks,
      deviceCheck: deviceChecks,
      device: devices,
      reviewer: users,
    })
    .from(securityEvents)
    .leftJoin(employees, eq(employees.id, securityEvents.employeeId))
    .leftJoin(riskAssessments, eq(riskAssessments.id, securityEvents.riskAssessmentId))
    .leftJoin(attendanceEvents, eq(attendanceEvents.id, securityEvents.attendanceEventId))
    .leftJoin(locations, eq(locations.id, attendanceEvents.locationId))
    .leftJoin(locationChecks, eq(locationChecks.attendanceEventId, attendanceEvents.id))
    .leftJoin(deviceChecks, eq(deviceChecks.attendanceEventId, attendanceEvents.id))
    .leftJoin(devices, eq(devices.id, attendanceEvents.deviceId))
    .leftJoin(users, eq(users.id, securityEvents.reviewedByUserId))
    .where(eq(securityEvents.id, id));
  if (!row) throw new NotFoundError("セキュリティイベント");

  const history = row.employee
    ? await db
        .select({ assessment: riskAssessments, serverTime: attendanceEvents.serverTime, type: attendanceEvents.type })
        .from(riskAssessments)
        .innerJoin(attendanceEvents, eq(attendanceEvents.id, riskAssessments.attendanceEventId))
        .where(eq(riskAssessments.employeeId, row.employee.id))
        .orderBy(desc(riskAssessments.createdAt))
        .limit(20)
    : [];

  await writeAudit(db, { ...viewer, actorUserId: viewer.userId, action: "security.gps_viewed", targetType: "security_event", targetId: id });
  await writeAudit(db, { ...viewer, actorUserId: viewer.userId, action: "security.risk_viewed", targetType: "security_event", targetId: id });
  return { ...row, history };
}

export async function reviewSecurityEvent(
  db: DbExecutor,
  id: string,
  decision: "reviewed" | "dismissed" | "confirmed",
  note: string,
  reviewer: { userId: string } & RequestMeta,
) {
  const [row] = await db
    .update(securityEvents)
    .set({ status: decision, reviewNote: note.slice(0, 2000), reviewedByUserId: reviewer.userId, reviewedAt: new Date() })
    .where(eq(securityEvents.id, id))
    .returning();
  if (!row) throw new NotFoundError("セキュリティイベント");
  await writeAudit(db, { ...reviewer, actorUserId: reviewer.userId, action: "security.event_reviewed", targetType: "security_event", targetId: id, details: { decision, note } });
  return row;
}
