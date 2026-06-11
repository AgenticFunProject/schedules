import { createHmac, timingSafeEqual } from "node:crypto";

export enum Scope {
  READ = "schedules:read",
  MODIFY = "schedules:modify",
}

export interface AuthConfig {
  issuer: string;
  audience: string;
  secret: string;
}

export interface TokenPayload {
  sub: string;
  scope: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

export function loadBearerAuthConfig(): AuthConfig {
  return {
    issuer: process.env["AUTH_JWT_ISSUER"] ?? "schedules-service",
    audience: process.env["AUTH_JWT_AUDIENCE"] ?? "schedules-api",
    secret: process.env["AUTH_JWT_SECRET"] ?? "dev-secret-do-not-use-in-production",
  };
}

function base64UrlEncode(data: Buffer): string {
  return data
    .toString("base64url")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

function sign(payload: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(payload).digest());
}

export function createBearerToken(payload: Omit<TokenPayload, "iat" | "exp">, config: AuthConfig): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const fullPayload: TokenPayload = { ...payload, iat, exp };
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signature = sign(`${header}.${body}`, config.secret);
  return `${header}.${body}.${signature}`;
}

export function authenticateBearerToken(token: string, config: AuthConfig): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }
  const [headerB64, bodyB64, signatureB64] = parts;
  const expectedSig = Buffer.from(sign(`${headerB64}.${bodyB64}`, config.secret), "base64url");
  const actualSig = Buffer.from(signatureB64, "base64url");
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    throw new Error("Invalid token signature");
  }
  let payload: TokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(bodyB64).toString("utf-8"));
  } catch {
    throw new Error("Invalid token body");
  }
  if (payload.iss !== config.issuer) {
    throw new Error("Invalid token issuer");
  }
  if (payload.aud !== config.audience) {
    throw new Error("Invalid token audience");
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }
  return payload;
}

export function ensureScope(payload: TokenPayload, requiredScope: Scope): void {
  const scopes = payload.scope.split(" ");
  if (!scopes.includes(requiredScope)) {
    throw new Error(`Insufficient scope: required ${requiredScope}`);
  }
}
