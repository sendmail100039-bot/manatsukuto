"use client";

import { useEffect, useState } from "react";

type Gps = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  heading: number | null;
  altitude: number | null;
  capturedAt: string;
};

type PunchType = "clock_in" | "clock_out" | "break_start" | "break_end";
type PunchResponse =
  | { ok: true; type: PunchType; serverTime: string; displayTime: string; displayDateTime: string; message: string; locationName: string | null }
  | { ok: false; error: { code: string; message: string } };

function deviceKey(): string {
  try {
    const k = localStorage.getItem("cp_device_key");
    if (k) return k;
    const fresh = crypto.randomUUID();
    localStorage.setItem("cp_device_key", fresh);
    return fresh;
  } catch {
    return "no-storage";
  }
}

function deviceInfo() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : "Other";
  const osVersion = (/Android ([\d.]+)/.exec(ua) ?? /OS ([\d_]+) like Mac/.exec(ua))?.[1]?.replace(/_/g, ".") ?? null;
  return { deviceKey: deviceKey(), os, osVersion, appVersion: "web-0.1.0" };
}

function getGps(): Promise<Gps | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy ?? null,
          speedMps: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          altitude: pos.coords.altitude ?? null,
          capturedAt: new Date(pos.timestamp).toISOString(),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function PunchPanel(props: {
  initialClockedIn: boolean;
  initialOnBreak: boolean;
  initialSince: string | null;
  initialLocation: string | null;
  canPunch: boolean;
  /** Some site requires / accepts a rotating site code → show the input. */
  siteCodeEnabled: boolean;
}) {
  const [clockedIn, setClockedIn] = useState(props.initialClockedIn);
  const [onBreak, setOnBreak] = useState(props.initialOnBreak);
  const [siteCode, setSiteCode] = useState("");
  const [since, setSince] = useState(props.initialSince);
  const [location, setLocation] = useState(props.initialLocation);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; time: string; location: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("code");
      if (c && /^\d{6}$/.test(c)) setSiteCode(c);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Tokyo" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function punch(type: PunchType) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setPhase("位置情報を取得しています…");
      const gps = await getGps();
      setPhase("送信しています…");
      const requestId = crypto.randomUUID();
      const res = await fetch("/api/attendance/punch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, requestId, clientTime: new Date().toISOString(), gps, device: deviceInfo(), siteCode: siteCode.trim() || null }),
      });
      const data = (await res.json()) as PunchResponse;
      if (!data.ok) {
        setError(data.error.message);
        return;
      }
      setResult({ message: data.message, time: data.displayTime, location: data.locationName });
      setSiteCode("");
      if (data.type === "clock_in") {
        setClockedIn(true);
        setOnBreak(false);
        setSince(data.displayDateTime);
        setLocation(data.locationName);
      } else if (data.type === "clock_out") {
        setClockedIn(false);
        setOnBreak(false);
        setSince(null);
        setLocation(null);
      } else {
        setOnBreak(data.type === "break_start");
      }
    } catch {
      setError("通信に失敗しました。電波状況を確認して再度お試しください。");
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }

  return (
    <>
      <div className="card">
        <div className="clock" aria-live="off">
          {now || "--:--:--"}
        </div>
        <p className="muted small" style={{ textAlign: "center" }}>
          端末の表示時刻です。記録にはサーバ時刻が使われます。
        </p>
      </div>

      {result ? (
        <div className="card punch-result" role="status">
          <div style={{ fontSize: "1.3rem", fontWeight: 600 }}>{result.message}</div>
          <div className="time">{result.time}</div>
          {result.location ? <div className="muted">{result.location}</div> : null}
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card">
        <div className="punch-status">
          <div>
            <div className="muted small">現在の状態</div>
            <div style={{ fontWeight: 600 }}>{clockedIn ? (onBreak ? "休憩中" : "出勤中") : "未出勤"}</div>
            {clockedIn && since ? (
              <div className="muted small">
                {since}
                {location ? ` / ${location}` : ""}
              </div>
            ) : null}
          </div>
        </div>
        {props.siteCodeEnabled ? (
          <label style={{ marginTop: ".75rem" }}>
            拠点コード(職場の画面に表示されている6桁。QRを読み取った場合は自動入力)
            <input inputMode="numeric" pattern="[0-9]*" maxLength={7} value={siteCode} onChange={(e) => setSiteCode(e.target.value)} placeholder="123456" />
          </label>
        ) : null}
        <div style={{ marginTop: "1rem", display: "grid", gap: ".6rem" }}>
          {!clockedIn ? (
            <button className="btn btn-accent btn-punch" onClick={() => punch("clock_in")} disabled={busy || !props.canPunch}>
              {busy ? phase ?? "処理中…" : "出勤"}
            </button>
          ) : onBreak ? (
            <button className="btn btn-primary btn-punch" onClick={() => punch("break_end")} disabled={busy || !props.canPunch}>
              {busy ? phase ?? "処理中…" : "休憩終了"}
            </button>
          ) : (
            <>
              <button className="btn btn-danger btn-punch" onClick={() => punch("clock_out")} disabled={busy || !props.canPunch}>
                {busy ? phase ?? "処理中…" : "退勤"}
              </button>
              <button className="btn btn-punch" style={{ padding: ".9rem", fontSize: "1.1rem" }} onClick={() => punch("break_start")} disabled={busy || !props.canPunch}>
                休憩開始
              </button>
            </>
          )}
        </div>
        <p className="muted small" style={{ marginTop: ".75rem" }}>
          位置情報の利用を許可してください。位置情報が取得できない場合も打刻は記録されます。
        </p>
      </div>
    </>
  );
}
