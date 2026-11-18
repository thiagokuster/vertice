import "server-only";
import { headers } from "next/headers";

export async function getRequestMeta() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || headerList.get("x-real-ip"),
    userAgent: headerList.get("user-agent"),
  };
}
