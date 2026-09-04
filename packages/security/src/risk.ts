import { DEFAULT_RISK_SETTINGS } from "@platform/database";

export type RiskLevel = "NORMAL" | "REVIEW" | "HIGH_RISK";

export type RiskSettings = typeof DEFAULT_RISK_SETTINGS;

export interface RiskReason {
  code: string;
  points: number;
  detail?: string;
}

export interface RiskSignals {
  gpsMissing: boolean;
  accuracyMeters?: number | null;
  withinRange?: boolean | null;
  overshootMeters?: number | null;
  deviceRegistered: boolean;
  deviceApproved: boolean;
  clientSkewSeconds?: number | null;
  impossibleTravel: boolean;
  impossibleTravelDetail?: string;
  mockLocation?: boolean | null;
  integrityFailed?: boolean | null;
}

export interface RiskAssessmentResult {
  score: number;
  level: RiskLevel;
  reasons: RiskReason[];
}

/** Merge persisted settings (partial, possibly hand-edited) over the defaults. */
export function resolveRiskSettings(stored: unknown): RiskSettings {
  const base = structuredClone(DEFAULT_RISK_SETTINGS);
  if (!stored || typeof stored !== "object") return base;
  const src = stored as Partial<RiskSettings>;
  return {
    weights: { ...base.weights, ...(src.weights ?? {}) },
    thresholds: { ...base.thresholds, ...(src.thresholds ?? {}) },
  };
}

export function levelForScore(score: number, thresholds: RiskSettings["thresholds"]): RiskLevel {
  if (score >= thresholds.highRisk) return "HIGH_RISK";
  if (score >= thresholds.review) return "REVIEW";
  return "NORMAL";
}

/**
 * Risk score (§19, §21, §22). Points are additive and fully configurable via
 * system_settings("security.risk"). The result is *never* used to auto-reject
 * a punch or to alter attendance (§26) - it only drives head-office review.
 */
export function assessRisk(signals: RiskSignals, settings: RiskSettings = DEFAULT_RISK_SETTINGS): RiskAssessmentResult {
  const { weights: w, thresholds: t } = settings;
  const reasons: RiskReason[] = [];
  const add = (code: string, points: number, detail?: string) => {
    if (points > 0) reasons.push({ code, points, detail });
  };

  if (signals.gpsMissing) {
    add("GPS_MISSING", w.gpsMissing, "位置情報が取得できませんでした");
  } else {
    if (signals.accuracyMeters != null && signals.accuracyMeters > t.poorAccuracyMeters) {
      add("GPS_ACCURACY_POOR", w.gpsAccuracyPoor, `GPS精度 ${Math.round(signals.accuracyMeters)}m (閾値 ${t.poorAccuracyMeters}m)`);
    }
    if (signals.withinRange === false) {
      const overshoot = signals.overshootMeters ?? 0;
      if (overshoot >= t.farOutsideMeters) {
        add("FAR_OUTSIDE_LOCATION", w.farOutsideLocation, `拠点許容範囲から ${Math.round(overshoot)}m 超過`);
      } else {
        add("OUTSIDE_LOCATION", w.outsideLocation, `拠点許容範囲から ${Math.round(overshoot)}m 超過`);
      }
    }
  }

  if (!signals.deviceRegistered) {
    add("UNREGISTERED_DEVICE", w.unregisteredDevice, "未登録端末からの打刻");
  } else if (!signals.deviceApproved) {
    add("UNAPPROVED_DEVICE", w.unapprovedDevice, "未承認端末からの打刻");
  }

  if (signals.clientSkewSeconds != null && Math.abs(signals.clientSkewSeconds) > t.clockSkewSeconds) {
    add("CLIENT_CLOCK_SKEW", w.clientClockSkew, `端末時刻ずれ ${Math.round(signals.clientSkewSeconds)}秒`);
  }

  if (signals.impossibleTravel) {
    add("IMPOSSIBLE_TRAVEL", w.impossibleTravel, signals.impossibleTravelDetail ?? "物理的に不可能な移動");
  }
  if (signals.mockLocation) {
    add("MOCK_LOCATION", w.mockLocation, "位置情報の偽装が検出されました");
  }
  if (signals.integrityFailed) {
    add("INTEGRITY_FAILED", w.integrityFailed, "端末/アプリ整合性チェック失敗");
  }

  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  return { score, level: levelForScore(score, t), reasons };
}

/** Which signal codes create a security_event and at which severity. */
export function severityForAssessment(result: RiskAssessmentResult): "info" | "low" | "medium" | "high" {
  if (result.level === "HIGH_RISK") return "high";
  if (result.level === "REVIEW") return "medium";
  if (result.reasons.length > 0) return "low";
  return "info";
}
