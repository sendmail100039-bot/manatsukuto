/**
 * Static catalog of roles, permissions and default settings.
 * Kept in the database package so both the seed script and the application
 * share one definition (no circular workspace dependency).
 */

export const PERMISSIONS = {
  // Attendance (self)
  "attendance.self.punch": "自分の出勤・退勤を記録する",
  "attendance.self.read": "自分の勤怠履歴を閲覧する",
  "attendance.self.request": "自分の打刻修正を申請する",
  // Attendance (management)
  "attendance.team.read": "所属職員の勤怠を閲覧する",
  "attendance.request.approve": "打刻修正申請を承認・却下する",
  "attendance.export": "勤怠データをCSV出力する",
  "attendance.all.read": "全社の勤怠を閲覧する",
  // Core masters
  "core.employee.read": "職員情報を閲覧する",
  "core.employee.write": "職員情報を登録・変更する",
  "core.organization.write": "組織・部署を管理する",
  "core.location.write": "勤務拠点を管理する",
  "core.device.read": "端末情報を閲覧する",
  "core.device.write": "端末を承認・無効化する",
  "core.user.admin": "ユーザーを管理する",
  "core.role.admin": "権限を管理する",
  // Security (head office / security admin only)
  "security.risk.read": "リスクスコアを閲覧する",
  "security.event.read": "セキュリティイベントを閲覧する",
  "security.location.read": "打刻GPS詳細を閲覧する",
  "security.device.read": "打刻端末詳細を閲覧する",
  "security.review": "セキュリティイベントを確認・判定する",
  "security.admin": "セキュリティ設定を管理する",
  // System
  "system.settings": "システム設定を変更する",
  "system.audit.read": "監査ログを閲覧する",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

export interface RoleDefinition {
  name: string;
  description: string;
  permissions: readonly PermissionCode[];
}

export const ROLES = {
  employee: {
    name: "一般職員",
    description: "出勤・退勤、勤怠履歴、修正申請",
    permissions: ["attendance.self.punch", "attendance.self.read", "attendance.self.request"],
  },
  manager: {
    name: "管理者",
    description: "職員確認、勤怠一覧、修正承認、拠点管理、CSV出力",
    permissions: [
      "attendance.self.punch",
      "attendance.self.read",
      "attendance.self.request",
      "attendance.team.read",
      "attendance.request.approve",
      "attendance.export",
      "core.employee.read",
      "core.location.write",
      "core.device.read",
    ],
  },
  head_office: {
    name: "本部管理者",
    description: "全体勤怠確認、異常打刻確認、セキュリティリスク確認、GPS異常確認",
    permissions: [
      "attendance.self.punch",
      "attendance.self.read",
      "attendance.self.request",
      "attendance.team.read",
      "attendance.all.read",
      "attendance.request.approve",
      "attendance.export",
      "core.employee.read",
      "core.device.read",
      "security.risk.read",
      "security.event.read",
      "security.location.read",
      "security.device.read",
      "security.review",
    ],
  },
  security_admin: {
    name: "セキュリティ管理者",
    description: "セキュリティ判定の確認と設定管理",
    permissions: [
      "attendance.all.read",
      "core.employee.read",
      "core.device.read",
      "core.device.write",
      "security.risk.read",
      "security.event.read",
      "security.location.read",
      "security.device.read",
      "security.review",
      "security.admin",
      "system.audit.read",
    ],
  },
  system_admin: {
    name: "システム管理者",
    description: "ユーザー管理、権限管理、マスタ管理、システム設定、監査ログ",
    permissions: ALL_PERMISSION_CODES,
  },
} satisfies Record<string, RoleDefinition>;

export type RoleCode = keyof typeof ROLES;

/** Roles that must use strong authentication (MFA) - §31. */
export const MFA_REQUIRED_ROLES: RoleCode[] = ["head_office", "security_admin", "system_admin"];

/** Risk scoring defaults - §21/§22. Editable via system_settings("security.risk"). */
export const DEFAULT_RISK_SETTINGS = {
  weights: {
    gpsMissing: 40,
    gpsAccuracyPoor: 20,
    outsideLocation: 30,
    farOutsideLocation: 50,
    unregisteredDevice: 30,
    unapprovedDevice: 15,
    clientClockSkew: 10,
    impossibleTravel: 80,
    mockLocation: 100,
    integrityFailed: 60,
  },
  thresholds: {
    /** accuracy (meters) above this is treated as poor */
    poorAccuracyMeters: 150,
    /** distance beyond radius considered "far outside" (meters) */
    farOutsideMeters: 2000,
    /** client clock skew tolerated (seconds) */
    clockSkewSeconds: 300,
    /** implausible travel speed between consecutive punches (km/h) */
    impossibleTravelKmh: 200,
    /** minimum distance to consider for impossible travel (meters) */
    impossibleTravelMinDistanceMeters: 5000,
    /** score >= review -> REVIEW, score >= highRisk -> HIGH_RISK */
    review: 30,
    highRisk: 80,
  },
};

export const DEFAULT_SETTINGS: Record<string, { value: unknown; description: string }> = {
  "security.risk": {
    value: DEFAULT_RISK_SETTINGS,
    description: "リスクスコアの重み・閾値 (§21, §22)",
  },
  "attendance.replay": {
    value: { requestMaxAgeSeconds: 300, idempotencyTtlHours: 48 },
    description: "Replay Attack / 重複打刻対策 (§48, §49)",
  },
  "auth.lockout": {
    value: { maxFailedAttempts: 5, lockMinutes: 15, ipMaxAttemptsPer15Min: 50 },
    description: "Brute Force 対策 (§46)",
  },
  "attendance.autoRegisterDevice": {
    value: { enabled: true, defaultApproval: "pending" },
    description: "初回利用端末を自動登録するか (§12)",
  },
};
