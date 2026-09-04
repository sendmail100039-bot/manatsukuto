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

type PunchResponse =
  | { ok: true; type: "clock_in" | "clock_out"; serverTime: string; displayTime: string; displayDateTime: string; message: string; locationName: string | null }
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

export function PunchPanel(props: { initialClockedIn: boolean; initialSince: string | null; initialLocation: string | null; canPunch: boolean }) {
  const [clockedIn, setClockedIn] = useState(props.initialClockedIn);
  const [since, setSince] = useState(props.initialSince);
  const [location, setLocation] = useState(props.initialLocation);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; time: string; location: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Tokyo" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function punch(type: "clock_in" | "clock_out") {
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
        body: JSON.stringify({ type, requestId, clientTime: new Date().toISOString(), gps, device: deviceInfo() }),
      });
      const data = (await res.json()) as PunchResponse;
      if (!data.ok) {
        setError(data.error.message);
        return;
      }
      setResult({ message: data.message, time: data.displayTime, location: data.locationName });
      if (data.type === "clock_in") {
        setClockedIn(true);
        setSince(data.displayDateTime);
        setLocation(data.locationName);
      } else {
        setClockedIn(false);
        setSince(null);
        setLocation(null);
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
            <div style={{ fontWeight: 600 }}>{clockedIn ? "出勤中" : "未出勤"}</div>
            {clockedIn && since ? (
              <div className="muted small">
                {since}
                {location ? ` / ${location}` : ""}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ marginTop: "1rem" }}>
          {clockedIn ? (
            <button className="btn btn-danger btn-punch" onClick={() => punch("clock_out")} disabled={busy || !props.canPunch}>
              {busy ? phase ?? "処理中…" : "退勤"}
            </button>
          ) : (
            <button className="btn btn-accent btn-punch" onClick={() => punch("clock_in")} disabled={busy || !props.canPunch}>
              {busy ? phase ?? "処理中…" : "出勤"}
            </button>
          )}
        </div>
        <p className="muted small" style={{ marginTop: ".75rem" }}>
          位置情報の利用を許可してください。位置情報が取得できない場合も打刻は記録されます。
        </p>
      </div>
    </>
  );
}
