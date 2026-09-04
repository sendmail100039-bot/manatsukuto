import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  attendanceBreaks,
  attendanceEvents,
  attendanceRecords,
  employees,
  idempotencyKeys,
  locations,
  type Database,
} from "@platform/database";
import {
  ConflictError,
  ValidationError,
  getSetting,
  listLocations,
  touchDevice,
  toWorkDate,
  writeAudit,
  type DeviceInfo,
  type Principal,
  type RequestMeta,
} from "@platform/core";
import {
  assessRisk,
  checkGeofence,
  evaluateImpossibleTravel,
  isValidCoordinate,
  nearestLocation,
  persistAssessment,
  resolveRiskSettings,
  verifySiteCode,
  type GeofenceResult,
  type ImpossibleTravelResult,
} from "@platform/security";

export type PunchType = "clock_in" | "clock_out" | "break_start" | "break_end";
const PUNCH_TYPES: PunchType[] = ["clock_in", "clock_out", "break_start", "break_end"];
const MESSAGES: Record<PunchType, string> = {
  clock_in: "出勤しました",
  clock_out: "退勤しました",
  break_start: "休憩を開始しました",
  break_end: "休憩を終了しました",
};

export interface GpsReading {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  heading?: number | null;
  altitude?: number | null;
  capturedAt?: string | null; // ISO
  /** Android "isFromMockProvider" or similar, if the client can supply it (Phase 2). */
  mockLocation?: boolean | null;
}

export interface PunchInput {
  type: PunchType;
  /** Client-generated UUID; the same id is never accepted twice (§48, §49). */
  requestId: string;
  clientTime: string; // ISO timestamp from the device
  gps: GpsReading | null;
  device: DeviceInfo;
  locationId?: string | null;
  integrity?: unknown;
  /** Rotating 6-digit site code shown at the workplace (Phase 2 動的QR). */
  siteCode?: string | null;
}

/** What a *general employee* is allowed to see (§23): no risk information at all. */
export interface PunchResult {
  ok: true;
  eventId: string;
  type: PunchType;
  serverTime: Date;
  workDate: string;
  locationName: string | null;
  message: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Record a clock-in / clock-out.
 *
 * - Official time is the server's clock (§16).
 * - Distance/geofence/risk are all computed server-side (§18); client values are never trusted.
 * - Replay & double-submit protection: request id is single-use, client timestamp must be fresh (§48, §49).
 * - The punch is *always* accepted when the employee is allowed to punch; risk is only recorded for
 *   head-office review (§26). The employee only receives the plain result (§23).
 */
export async function recordPunch(db: Database, principal: Principal, input: PunchInput, meta: RequestMeta): Promise<PunchResult> {
  if (!principal.employeeId) throw new ValidationError("このユーザーには職員情報が紐づいていません");
  if (!principal.permissions.has("attendance.self.punch")) throw new ValidationError("打刻権限がありません");
  if (!PUNCH_TYPES.includes(input.type)) throw new ValidationError("打刻種別が不正です");
  if (!UUID_RE.test(input.requestId ?? "")) throw new ValidationError("requestId が不正です");

  const serverTime = new Date();
  const replay = await getSetting<{ requestMaxAgeSeconds: number; idempotencyTtlHours: number }>(db, "attendance.replay");
  const clientTime = input.clientTime ? new Date(input.clientTime) : null;
  if (!clientTime || Number.isNaN(clientTime.getTime())) throw new ValidationError("端末時刻が不正です");
  const skewSeconds = Math.round((clientTime.getTime() - serverTime.getTime()) / 1000);
  if (Math.abs(skewSeconds) > replay.requestMaxAgeSeconds) {
    // A stale timestamp is the signature of a replayed request. Reject (also protects the audit trail).
    await writeAudit(db, { ...meta, actorUserId: principal.userId, actorEmployeeId: principal.employeeId, action: "attendance.punch_rejected", details: { reason: "stale_timestamp", skewSeconds } });
    throw new ConflictError("端末の時刻がサーバと大きくずれています。端末の時刻設定を確認して再度お試しください。", { code: "STALE_REQUEST" });
  }

  const employeeId = principal.employeeId;
  const riskSettings = resolveRiskSettings(await getSetting(db, "security.risk"));
  const deviceSettings = await getSetting<{ enabled: boolean; defaultApproval: "pending" | "approved" }>(db, "attendance.autoRegisterDevice");

  return db.transaction(async (tx) => {
    // Serialize punches per employee (prevents double submit under concurrency).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${employeeId}))`);

    // Idempotency key (single use, TTL). Unique PK => a replay fails here.
    try {
      await tx.insert(idempotencyKeys).values({
        key: `punch:${input.requestId}`,
        userId: principal.userId,
        scope: "attendance.punch",
        expiresAt: new Date(serverTime.getTime() + replay.idempotencyTtlHours * 3_600_000),
      });
    } catch {
      throw new ConflictError("この打刻はすでに受け付けています", { code: "DUPLICATE_REQUEST" });
    }

    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee || employee.status === "retired") throw new ValidationError("打刻できない職員です");

    // --- open record state ---------------------------------------------------
    const [openRecord] = await tx
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.status, "open")))
      .orderBy(desc(attendanceRecords.createdAt))
      .limit(1);
    if (input.type === "clock_in" && openRecord) {
      throw new ConflictError("すでに出勤中です。先に退勤してください。", { code: "ALREADY_CLOCKED_IN" });
    }
    if (input.type !== "clock_in" && !openRecord) {
      throw new ConflictError("出勤記録がありません。先に出勤してください。", { code: "NOT_CLOCKED_IN" });
    }
    const [openBreak] = openRecord
      ? await tx
          .select()
          .from(attendanceBreaks)
          .where(and(eq(attendanceBreaks.recordId, openRecord.id), isNull(attendanceBreaks.endedAt)))
          .limit(1)
      : [];
    if (input.type === "break_start" && openBreak) throw new ConflictError("すでに休憩中です。", { code: "ALREADY_ON_BREAK" });
    if (input.type === "break_end" && !openBreak) throw new ConflictError("休憩中ではありません。", { code: "NOT_ON_BREAK" });
    if (input.type === "clock_out" && openBreak) throw new ConflictError("休憩中です。先に休憩を終了してください。", { code: "ON_BREAK" });

    // --- device ---------------------------------------------------------------
    const { device, isNew } = await touchDevice(tx, employeeId, input.device, {
      autoRegister: deviceSettings.enabled,
      defaultApproval: deviceSettings.defaultApproval,
    });
    if (device && isNew) {
      await writeAudit(tx, { ...meta, actorUserId: principal.userId, actorEmployeeId: employeeId, action: "device.registered", targetType: "device", targetId: device.id });
    }
    if (device?.disabled || device?.approvalStatus === "rejected") {
      throw new ConflictError("この端末は利用が停止されています。管理者に連絡してください。", { code: "DEVICE_DISABLED" });
    }

    // --- GPS / geofence -------------------------------------------------------
    const gps = input.gps && isValidCoordinate(input.gps) ? input.gps : null;
    const activeLocations = await listLocations(tx, { activeOnly: true });
    let targetLocation = null as (typeof activeLocations)[number] | null;
    let geofence: GeofenceResult | null = null;
    if (input.locationId) {
      targetLocation = activeLocations.find((l) => l.id === input.locationId) ?? null;
      if (!targetLocation) throw new ValidationError("指定された勤務拠点では打刻できません");
      if (gps) geofence = checkGeofence(gps, targetLocation);
    } else if (gps) {
      const best = nearestLocation(gps, activeLocations);
      if (best) {
        targetLocation = best.site;
        geofence = best.check;
      }
    }
    if (!targetLocation && employee.primaryLocationId) {
      targetLocation = activeLocations.find((l) => l.id === employee.primaryLocationId) ?? null;
      if (targetLocation && gps) geofence = checkGeofence(gps, targetLocation);
    }

    // --- site code (dynamic QR) ------------------------------------------------
    // A valid rotating code proves presence at that site more strongly than GPS,
    // so when the code matches another active site, that site becomes the target.
    let siteCodeStatus: "missing" | "invalid" | "verified" | null = null;
    const givenCode = (input.siteCode ?? "").trim();
    if (givenCode) {
      const verifiedSite =
        (targetLocation?.siteCodeSecret && verifySiteCode(targetLocation.siteCodeSecret, givenCode, serverTime.getTime()) ? targetLocation : null) ??
        activeLocations.find((l) => l.siteCodeSecret && verifySiteCode(l.siteCodeSecret, givenCode, serverTime.getTime())) ??
        null;
      if (verifiedSite) {
        siteCodeStatus = "verified";
        if (verifiedSite.id !== targetLocation?.id) {
          targetLocation = verifiedSite;
          geofence = gps ? checkGeofence(gps, verifiedSite) : null;
        }
      } else {
        siteCodeStatus = "invalid";
      }
    } else if (targetLocation?.siteCodeSecret && targetLocation.siteCodeRequired) {
      siteCodeStatus = "missing";
    }

    // --- previous punch for impossible travel ---------------------------------
    const [previous] = await tx
      .select()
      .from(attendanceEvents)
      .where(and(eq(attendanceEvents.employeeId, employeeId), isNotNull(attendanceEvents.latitude), lt(attendanceEvents.serverTime, serverTime)))
      .orderBy(desc(attendanceEvents.serverTime))
      .limit(1);
    let travel: ImpossibleTravelResult | null = null;
    if (gps && previous && previous.latitude != null && previous.longitude != null) {
      travel = evaluateImpossibleTravel(
        { latitude: previous.latitude, longitude: previous.longitude, at: previous.serverTime },
        { latitude: gps.latitude, longitude: gps.longitude, at: serverTime },
        { maxSpeedKmh: riskSettings.thresholds.impossibleTravelKmh, minDistanceMeters: riskSettings.thresholds.impossibleTravelMinDistanceMeters },
      );
    }

    // --- event ----------------------------------------------------------------
    const [event] = await tx
      .insert(attendanceEvents)
      .values({
        employeeId,
        userId: principal.userId,
        deviceId: device?.id ?? null,
        type: input.type,
        serverTime,
        clientTime,
        clientSkewSeconds: skewSeconds,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
        accuracyMeters: gps?.accuracyMeters ?? null,
        speedMps: gps?.speedMps ?? null,
        heading: gps?.heading ?? null,
        altitude: gps?.altitude ?? null,
        gpsCapturedAt: gps?.capturedAt ? new Date(gps.capturedAt) : null,
        locationId: targetLocation?.id ?? null,
        distanceMeters: geofence?.distanceMeters ?? null,
        withinRange: geofence?.withinRange ?? null,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        requestId: input.requestId,
        siteCodeVerified: siteCodeStatus === null ? null : siteCodeStatus === "verified",
      })
      .returning();

    // --- record / breaks --------------------------------------------------------
    const workDate = input.type === "clock_in" ? toWorkDate(serverTime) : openRecord!.workDate;
    if (input.type === "clock_in") {
      await tx.insert(attendanceRecords).values({
        employeeId,
        workDate,
        locationId: targetLocation?.id ?? null,
        clockInEventId: event!.id,
        clockInAt: serverTime,
        status: "open",
      });
    } else if (input.type === "break_start") {
      await tx.insert(attendanceBreaks).values({ recordId: openRecord!.id, employeeId, startEventId: event!.id, startedAt: serverTime });
    } else if (input.type === "break_end") {
      await tx.update(attendanceBreaks).set({ endEventId: event!.id, endedAt: serverTime }).where(eq(attendanceBreaks.id, openBreak!.id));
      const minutes = Math.round((serverTime.getTime() - openBreak!.startedAt.getTime()) / 60_000);
      await tx
        .update(attendanceRecords)
        .set({ breakMinutes: sql`${attendanceRecords.breakMinutes} + ${minutes}`, updatedAt: new Date() })
        .where(eq(attendanceRecords.id, openRecord!.id));
    } else {
      await tx
        .update(attendanceRecords)
        .set({ clockOutEventId: event!.id, clockOutAt: serverTime, status: "closed", updatedAt: new Date() })
        .where(eq(attendanceRecords.id, openRecord!.id));
    }

    // --- risk (never shown to the employee) -----------------------------------
    const assessment = assessRisk(
      {
        gpsMissing: !gps,
        accuracyMeters: gps?.accuracyMeters ?? null,
        withinRange: geofence?.withinRange ?? null,
        overshootMeters: geofence?.overshootMeters ?? null,
        deviceRegistered: !!device,
        deviceApproved: device?.approvalStatus === "approved",
        clientSkewSeconds: skewSeconds,
        impossibleTravel: travel?.impossible ?? false,
        impossibleTravelDetail: travel ? `${(travel.distanceMeters / 1000).toFixed(1)}km を ${travel.elapsedSeconds}秒で移動 (${Math.round(travel.speedKmh)}km/h)` : undefined,
        mockLocation: gps?.mockLocation ?? null,
        gpsAgeSeconds: gps?.capturedAt && !Number.isNaN(new Date(gps.capturedAt).getTime()) ? (serverTime.getTime() - new Date(gps.capturedAt).getTime()) / 1000 : null,
        positionRepeated:
          !!gps &&
          !!previous &&
          previous.latitude === gps.latitude &&
          previous.longitude === gps.longitude &&
          serverTime.getTime() - previous.serverTime.getTime() >= riskSettings.thresholds.positionRepeatedMinIntervalSeconds * 1000,
        siteCode: siteCodeStatus,
        integrityFailed: !!input.integrity && typeof input.integrity === "object" && (input.integrity as { failed?: boolean }).failed === true,
      },
      riskSettings,
    );
    await persistAssessment(tx, {
      attendanceEventId: event!.id,
      employeeId,
      userId: principal.userId,
      assessment,
      location: {
        locationId: targetLocation?.id ?? null,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
        accuracyMeters: gps?.accuracyMeters ?? null,
        geofence,
        gpsMissing: !gps,
        previousEventId: previous?.id ?? null,
        travel,
      },
      device: {
        deviceId: device?.id ?? null,
        registered: !!device,
        approved: device?.approvalStatus === "approved",
        newDevice: isNew,
        mockLocation: gps?.mockLocation ?? null,
        integrity: input.integrity ?? null,
      },
      meta,
    });

    await writeAudit(tx, {
      ...meta,
      actorUserId: principal.userId,
      actorEmployeeId: employeeId,
      action: input.type === "clock_in" ? "attendance.clock_in" : input.type === "clock_out" ? "attendance.clock_out" : "attendance.break",
      targetType: "attendance_event",
      targetId: event!.id,
      details: { type: input.type, locationId: targetLocation?.id ?? null, withinRange: geofence?.withinRange ?? null, siteCode: siteCodeStatus },
    });

    return {
      ok: true,
      eventId: event!.id,
      type: input.type,
      serverTime,
      workDate,
      locationName: targetLocation?.name ?? null,
      message: MESSAGES[input.type],
    };
  });
}

/** Current state for the employee's home screen (no risk information). */
export async function getPunchState(db: Database, employeeId: string) {
  const [openRecord] = await db
    .select({ record: attendanceRecords, locationName: locations.name })
    .from(attendanceRecords)
    .leftJoin(locations, eq(locations.id, attendanceRecords.locationId))
    .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.status, "open")))
    .orderBy(desc(attendanceRecords.createdAt))
    .limit(1);
  const [last] = await db
    .select({ record: attendanceRecords, locationName: locations.name })
    .from(attendanceRecords)
    .leftJoin(locations, eq(locations.id, attendanceRecords.locationId))
    .where(and(eq(attendanceRecords.employeeId, employeeId), sql`${attendanceRecords.status} <> 'superseded'`))
    .orderBy(desc(attendanceRecords.createdAt))
    .limit(1);
  const [openBreak] = openRecord
    ? await db
        .select()
        .from(attendanceBreaks)
        .where(and(eq(attendanceBreaks.recordId, openRecord.record.id), isNull(attendanceBreaks.endedAt)))
        .limit(1)
    : [];
  return {
    clockedIn: !!openRecord,
    onBreak: !!openBreak,
    breakStartedAt: openBreak?.startedAt ?? null,
    open: openRecord ?? null,
    last: last ?? null,
  };
}
