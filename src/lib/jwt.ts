import type { Context } from "hono";
import type { Bindings } from "../types";

const JWT_EXPIRE_SECS = 86400; // 24h

function b64url(str: string): string {
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlDecode(str: string): string {
	return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

export async function signJwt(sub: string, secret: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const payload = b64url(JSON.stringify({ sub, exp: now + JWT_EXPIRE_SECS }));
	const data = `${header}.${payload}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sigBuffer = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(data),
	);
	const sig = b64url(String.fromCharCode(...new Uint8Array(sigBuffer)));
	return `${data}.${sig}`;
}

export async function verifyJwt(
	token: string,
	secret: string,
): Promise<boolean> {
	const parts = token.split(".");
	if (parts.length !== 3) return false;
	const data = `${parts[0]}.${parts[1]}`;
	let payload: { exp?: number };
	try {
		payload = JSON.parse(b64urlDecode(parts[1])) as { exp?: number };
	} catch {
		return false;
	}
	if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return false;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	let sigBytes: Uint8Array;
	try {
		sigBytes = Uint8Array.from(b64urlDecode(parts[2]), (c) => c.charCodeAt(0));
	} catch {
		return false;
	}
	return crypto.subtle.verify(
		"HMAC",
		key,
		sigBytes,
		new TextEncoder().encode(data),
	);
}

export function getBearerToken(
	c: Context<{ Bindings: Bindings }>,
): string | null {
	const auth = c.req.header("Authorization") ?? "";
	return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

// timingSafeEqual 用 SHA-256 防止时序攻击
export async function safeEqual(a: string, b: string): Promise<boolean> {
	const enc = new TextEncoder();
	const [ha, hb] = await Promise.all([
		crypto.subtle.digest("SHA-256", enc.encode(a)),
		crypto.subtle.digest("SHA-256", enc.encode(b)),
	]);
	return crypto.subtle.timingSafeEqual(ha, hb);
}
