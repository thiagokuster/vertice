import "server-only";
import { headers } from "next/headers";
import { clientIpFrom } from "@/lib/client-ip";

export async function getRequestMeta() {
  return clientIpFrom(await headers());
}
