import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { users } from "../db/schema";
import { signJwt } from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import { KEY_RE, scriptStore } from "../lib/scripts-store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";
import chat from "./chat";
import threads from "./threads";
import usersRoute from "./users";

const api = new Hono<AppEnv>();

async function hasUsers(db: ReturnType<typeof getDb>) {
	const [row] = await db.select({ value: count() }).from(users);
	return (row?.value ?? 0) > 0;
}

// 登录（无需鉴权）；首次空库登录会 bootstrap 第一个 admin。
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

	const db = getDb(c.env.DB);
	let user = await db.query.users.findFirst({
		where: eq(users.username, username),
	});

	if (!user && !(await hasUsers(db))) {
		const timestamp = Date.now();
		user = {
			id: crypto.randomUUID(),
			username,
			passwordHash: await hashPassword(password),
			role: "admin" as const,
			disabledAt: null,
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		await db.insert(users).values(user);
	}

	if (!user || user.disabledAt !== null) {
		return c.json({ error: "Invalid credentials" }, 401);
	}
	if (!(await verifyPassword(password, user.passwordHash))) {
		return c.json({ error: "Invalid credentials" }, 401);
	}

	const token = await signJwt(user, c.env.JWT_SECRET);
	return c.json({
		token,
		user: { id: user.id, username: user.username, role: user.role },
	});
});

// 登出（客户端清 localStorage，此接口仅为形式）
api.post("/logout", (c) => c.json({ ok: true }));

// 检查登录状态
api.get("/me", requireAuth, (c) => {
	const user = c.get("user");
	return c.json({ ok: true, user });
});

// 用户管理
api.route("/users", usersRoute);

// 列出所有脚本
api.get("/scripts", requireAuth, async (c) => {
	return c.json(await scriptStore(c.env).list());
});

// 获取单个脚本
api.get("/scripts/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	const result = await scriptStore(c.env).getContent(key);
	if (result === null) return c.json({ error: "Script not found" }, 404);
	if ("missingObject" in result) {
		return c.json({ error: "Script content missing from R2" }, 500);
	}
	return c.json({ key: result.key, content: result.content });
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
	const store = scriptStore(c.env);
	if ((await store.getByKey(key)) !== undefined) {
		return c.json({ error: "Script already exists. Use PUT to update." }, 409);
	}
	await store.create(key, content, c.get("user").id);
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
	const result = await scriptStore(c.env).update(key, body.content);
	if (!result) return c.json({ error: "Script not found" }, 404);
	return c.json({ key, success: true });
});

// 删除脚本
api.delete("/scripts/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	await scriptStore(c.env).delete(key);
	return c.json({ key, success: true });
});

// 获取 AI 草稿
api.get("/unsaved/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	const draft = await scriptStore(c.env).getDraft(key, c.get("user").id);
	if (!draft) return c.json({ error: "No draft found" }, 404);
	return c.json({ key, content: draft.draftContent });
});

// 删除 AI 草稿（Reject 时调用）
api.delete("/unsaved/:key", requireAuth, async (c) => {
	const key = c.req.param("key") ?? "";
	await scriptStore(c.env).deleteDraft(key, c.get("user").id);
	return c.json({ key, success: true });
});

api.route("/threads", threads);
api.route("/chat", chat);

export default api;
