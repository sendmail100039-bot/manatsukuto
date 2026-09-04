import { PlatformError } from "@platform/core";

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

/** Wrap a server-action body so domain errors become form messages (redirects pass through). */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    if (err instanceof PlatformError) return { ok: false, error: err.message };
    if (err && typeof err === "object" && "digest" in err && String((err as { digest?: string }).digest).startsWith("NEXT_")) throw err;
    console.error(err);
    return { ok: false, error: "処理中にエラーが発生しました" };
  }
}

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
export const num = (fd: FormData, key: string) => Number(String(fd.get(key) ?? "").trim());
export const bool = (fd: FormData, key: string) => fd.get(key) === "on" || fd.get(key) === "true";
