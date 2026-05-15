import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";

type Bindings = CloudflareBindings & {
	ADMIN_PASSWORD: string;
};

// ── JWT 工具 ──────────────────────────────────────────────────────────────────

const JWT_EXPIRE_SECS = 86400; // 24h

function b64url(str: string): string {
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlDecode(str: string): string {
	return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

async function signJwt(sub: string, secret: string): Promise<string> {
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

async function verifyJwt(token: string, secret: string): Promise<boolean> {
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

function getBearerToken(c: Context<{ Bindings: Bindings }>): string | null {
	const auth = c.req.header("Authorization") ?? "";
	return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

// timingSafeEqual 用 SHA-256 防止时序攻击
async function safeEqual(a: string, b: string): Promise<boolean> {
	const enc = new TextEncoder();
	const [ha, hb] = await Promise.all([
		crypto.subtle.digest("SHA-256", enc.encode(a)),
		crypto.subtle.digest("SHA-256", enc.encode(b)),
	]);
	return crypto.subtle.timingSafeEqual(ha, hb);
}

// requireAuth 中间件
const requireAuth: MiddlewareHandler<{ Bindings: Bindings }> = async (
	c,
	next,
) => {
	const token = getBearerToken(c);
	if (!token || !(await verifyJwt(token, c.env.ADMIN_PASSWORD))) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	return next();
};

// ── 应用主体 ──────────────────────────────────────────────────────────────────

const KV_PREFIX = "SCRIPT_";

const app = new Hono<{ Bindings: Bindings }>();

// /_proxy：透传 fetch，不缓冲 body
app.get("/_proxy", async (c) => {
	const url = c.req.query("url");
	if (!url) return c.text("Missing ?url= parameter", 400);

	let target: URL;
	try {
		target = new URL(url);
	} catch {
		return c.text("Invalid URL", 400);
	}

	if (target.protocol !== "https:") {
		return c.text("Only HTTPS URLs are allowed", 400);
	}

	const upstream = await fetch(target.toString(), {
		headers: { "User-Agent": "shelflare/1.0" },
	});

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"Content-Type":
				upstream.headers.get("Content-Type") ?? "application/octet-stream",
			"Content-Length": upstream.headers.get("Content-Length") ?? "",
			"Cache-Control": "no-store",
		},
	});
});

// ── /_api：管理 API ──────────────────────────────────────────────────────────

const api = new Hono<{ Bindings: Bindings }>();

// 登录（无需鉴权）
api.post("/login", async (c) => {
	let body: { username?: string; password?: string };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const { username, password } = body;
	if (!username || !password) {
		return c.json({ error: "Missing username or password" }, 400);
	}

	const [userOk, passOk] = await Promise.all([
		safeEqual(username, c.env.ADMIN_USERNAME ?? ""),
		safeEqual(password, c.env.ADMIN_PASSWORD ?? ""),
	]);

	if (!userOk || !passOk) {
		return c.json({ error: "Invalid credentials" }, 401);
	}

	const token = await signJwt(username, c.env.ADMIN_PASSWORD);
	return c.json({ token });
});

// 登出（客户端清 localStorage，此接口仅为形式）
api.post("/logout", (c) => c.json({ ok: true }));

// 检查登录状态
api.get("/me", requireAuth, (c) => c.json({ ok: true }));

// 列出所有脚本
api.get("/scripts", requireAuth, async (c) => {
	const list = await c.env.SCRIPTS.list({ prefix: KV_PREFIX });
	return c.json({
		keys: list.keys.map((k) => ({ name: k.name.slice(KV_PREFIX.length) })),
		list_complete: list.list_complete,
	});
});

// 获取单个脚本
api.get("/scripts/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	const content = await c.env.SCRIPTS.get(KV_PREFIX + key);
	if (content === null) return c.json({ error: "Script not found" }, 404);
	return c.json({ key, content });
});

// 创建脚本
api.post("/scripts", requireAuth, async (c) => {
	let body: { key?: string; content?: string };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	const { key, content } = body;
	if (!key || typeof content !== "string") {
		return c.json({ error: "Missing key or content" }, 400);
	}
	if ((await c.env.SCRIPTS.get(KV_PREFIX + key)) !== null) {
		return c.json({ error: "Script already exists. Use PUT to update." }, 409);
	}
	await c.env.SCRIPTS.put(KV_PREFIX + key, content);
	return c.json({ key, success: true }, 201);
});

// 更新脚本
api.put("/scripts/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	let body: { content?: string };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	if (typeof body.content !== "string") {
		return c.json({ error: "Missing content" }, 400);
	}
	await c.env.SCRIPTS.put(KV_PREFIX + key, body.content);
	return c.json({ key, success: true });
});

// 删除脚本
api.delete("/scripts/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	await c.env.SCRIPTS.delete(KV_PREFIX + key);
	return c.json({ key, success: true });
});

app.route("/_api", api);

// ── /* 脚本分发（支持多段路径 key，如 install/test） ─────────────────────────

app.get("/*", async (c) => {
	const key = c.req.param("*") ?? "";

	// _ 开头为内部路径，交给 ASSETS（not_found_handling 自动 SPA fallback）
	if (key.startsWith("_")) return c.env.ASSETS.fetch(c.req.raw);

	const content = await c.env.SCRIPTS.get(KV_PREFIX + key);
	if (content === null) return c.text(`Script '${key}' not found`, 404);

	// 在 shebang 行之后注入 querystring 变量
	const params = new URL(c.req.url).searchParams;
	const injected: string[] = [];
	for (const [name, value] of params.entries()) {
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
			const safe = value.replace(/'/g, "'\\''");
			injected.push(`export ${name}='${safe}'`);
		}
	}

	let final = content;
	if (injected.length > 0) {
		const lines = content.split("\n");
		const hasShebang = lines[0].startsWith("#!");
		const shebang = hasShebang ? lines[0] : null;
		const rest = hasShebang ? lines.slice(1) : lines;
		const block = [
			"# --- shelflare injected variables ---",
			...injected,
			"# ---",
		].join("\n");
		final = [...(shebang ? [shebang] : []), block, ...rest].join("\n");
	}

	return new Response(final, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
});

// 全局 fallback → ASSETS（not_found_handling 自动处理 SPA）
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
