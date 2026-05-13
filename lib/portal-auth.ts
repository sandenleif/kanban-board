import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "kb_portal";
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-secret-change-me-in-production-32ch"
);

export interface PortalSession {
  portalUserId: string;
  name: string;
  email: string;
  organizationId: string;
  orgSlug: string;
}

export async function createPortalSession(payload: PortalSession) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      portalUserId: payload.portalUserId as string,
      name: payload.name as string,
      email: payload.email as string,
      organizationId: payload.organizationId as string,
      orgSlug: payload.orgSlug as string,
    };
  } catch {
    return null;
  }
}

export async function requirePortalSession(orgSlug: string): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session || session.orgSlug !== orgSlug) redirect(`/portal/${orgSlug}/login`);
  return session;
}

export async function clearPortalSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
