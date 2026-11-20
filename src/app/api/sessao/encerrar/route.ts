import { NextResponse } from "next/server";
import { signOut } from "@/auth";

const COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
];

export async function GET() {
  try {
    await signOut({ redirect: false });
  } catch {
    // O cookie pode estar inválido. A resposta abaixo apaga mesmo assim.
  }
  const response = NextResponse.redirect(new URL("/login", process.env.AUTH_URL || "http://localhost:3000"));
  for (const name of COOKIES) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: name.startsWith("__Secure") || name.startsWith("__Host"),
    });
  }
  return response;
}
