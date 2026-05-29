import type { Context } from "hono";

const JWT_EXPIRE_SECS = 86400; // 24h

export type JwtPayload = {
	sub: string;
	username: string;
	role: "admin" | "user";
	exp: number;
};

function b64url(str: string): string {
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlDecode(str: string): string {
	return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

export async function signJwt(
	user: { id: string; username: string; role: "admin" | "user" },
	secret: string,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const payload = b64url(
		JSON.stringify({
			sub: user.id,
			username: user.username,
			role: user.role,
			exp: now + JWT_EXPIRE_SECS,
		}),
	);
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
): Promise<JwtPayload | null> {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const data = `${parts[0]}.${parts[1]}`;
	let payload: JwtPayload;
	try {
		payload = JSON.parse(b64urlDecode(parts[1])) as JwtPayload;
	} catch {
		return null;
	}
	if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
	if (!payload.sub || !payload.username || !payload.role) return null;
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
		return null;
	}
	const verified = await crypto.subtle.verify(
		"HMAC",
		key,
		sigBytes,
		new TextEncoder().encode(data),
	);
	return verified ? payload : null;
}

export function getBearerToken(c: Context): string | null {
	const auth = c.req.header("Authorization") ?? "";
	return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}
