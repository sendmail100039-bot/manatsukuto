"use client";

import { useEffect, useState } from "react";

export function SiteDisplayClient(props: { locationName: string; code: string; expiresInSeconds: number; stepSeconds: number; qrSvg: string }) {
  const [remaining, setRemaining] = useState(props.expiresInSeconds);
  useEffect(() => {
    setRemaining(props.expiresInSeconds);
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.location.reload();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [props.code, props.expiresInSeconds]);
  const pct = Math.round((remaining / props.stepSeconds) * 100);
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#183d36", color: "#fff", textAlign: "center", padding: "1rem" }}>
      <div>
        <div style={{ fontSize: "1.4rem", opacity: 0.85 }}>{props.locationName}</div>
        <div style={{ fontSize: "1rem", opacity: 0.7, marginBottom: "1rem" }}>打刻用 拠点コード</div>
        <div style={{ background: "#fff", borderRadius: 24, padding: "1.25rem", display: "inline-block" }}>
          <div style={{ width: "min(60vw, 360px)" }} dangerouslySetInnerHTML={{ __html: props.qrSvg }} />
        </div>
        <div style={{ fontSize: "clamp(3rem, 12vw, 7rem)", fontWeight: 800, letterSpacing: ".15em", fontVariantNumeric: "tabular-nums", marginTop: "1rem" }}>
          {props.code.slice(0, 3)} {props.code.slice(3)}
        </div>
        <div style={{ width: "min(60vw, 360px)", height: 8, background: "rgba(255,255,255,.2)", borderRadius: 4, margin: "0 auto" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#6ce9a6", borderRadius: 4, transition: "width 1s linear" }} />
        </div>
        <div style={{ opacity: 0.7, marginTop: ".5rem" }}>あと {remaining} 秒で更新されます。スマートフォンで QR を読み取るか、コードを入力して打刻してください。</div>
      </div>
    </main>
  );
}
