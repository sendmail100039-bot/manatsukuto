import { headers } from "next/headers";
import { clientIp } from "@platform/auth";
import type { RequestMeta } from "@platform/core";

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  return { ipAddress: clientIp(h), userAgent: h.get("user-agent") };
}
