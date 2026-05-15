import { Hono } from "hono";
import { safeEqual, signJwt } from "../lib/jwt";
import { scripts } from "../lib/kv";
import { requireAuth } from "../middleware";
import type { Bindings } from "../types";

// key 格式：字母/数字开头，只含字母数字、连字符、下划线，不含斜杠
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

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
	const kv = scripts(c.env.SCRIPTS);
	const list = await kv.list();
	return c.json(list);
});

// 获取单个脚本
api.get("/scripts/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	const content = await scripts(c.env.SCRIPTS).get(key);
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
	if (!KEY_RE.test(key)) {
		return c.json(
			{
				error:
					"Invalid key: use letters, numbers, hyphens, underscores only; no leading underscore or slash",
			},
			400,
		);
	}
	const kv = scripts(c.env.SCRIPTS);
	if ((await kv.get(key)) !== null) {
		return c.json({ error: "Script already exists. Use PUT to update." }, 409);
	}
	await kv.put(key, content);
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
	await scripts(c.env.SCRIPTS).put(key, body.content);
	return c.json({ key, success: true });
});

// 删除脚本
api.delete("/scripts/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	await scripts(c.env.SCRIPTS).delete(key);
	return c.json({ key, success: true });
});

export default api;
