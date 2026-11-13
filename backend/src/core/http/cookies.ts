import type { Request, Response } from "express";

/** Minimal cookie reading and writing (no dependency). Values are opaque base64url tokens. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}

export interface SessionCookieConfig {
  name: string;
  secure: boolean;
}

/** HttpOnly, SameSite=Lax, Path=/, and Secure outside local development (ADR-0004). No Domain attribute. */
export function setSessionCookie(
  res: Response,
  config: SessionCookieConfig,
  token: string,
  maxAgeSeconds: number,
): void {
  res.cookie(config.name, token, {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  });
}

export function clearSessionCookie(res: Response, config: SessionCookieConfig): void {
  res.clearCookie(config.name, {
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax",
    path: "/",
  });
}
