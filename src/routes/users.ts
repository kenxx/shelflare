import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db";
import { type UserRole, users } from "../db/schema";
import { hashPassword } from "../auth/password";
import { requireAdmin, requireAuth } from "../middleware";
import type { AppEnv } from "../types";

const usersRoute = new Hono<AppEnv>();

function publicUser(user: typeof users.$inferSelect) {
	return {
		id: user.id,
		username: user.username,
		role: user.role,
		disabledAt: user.disabledAt,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};
}

function isRole(role: unknown): role is UserRole {
	return role === "admin" || role === "user";
}

usersRoute.use("*", requireAuth, requireAdmin);

usersRoute.get("/", async (c) => {
	const rows = await getDb(c.env.DB)
		.select()
		.from(users)
		.orderBy(asc(users.username));
	return c.json({ users: rows.map(publicUser) });
});

usersRoute.post("/", async (c) => {
	let body: { username?: string; password?: string; role?: string };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	const username = body.username?.trim();
	if (!username || !body.password || !isRole(body.role)) {
		return c.json({ error: "Missing username, password, or role" }, 400);
	}

	const db = getDb(c.env.DB);
	if (await db.query.users.findFirst({ where: eq(users.username, username) })) {
		return c.json({ error: "Username already exists" }, 409);
	}
	const timestamp = Date.now();
	const user = {
		id: crypto.randomUUID(),
		username,
		passwordHash: await hashPassword(body.password),
		role: body.role,
		disabledAt: null,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	await db.insert(users).values(user);
	return c.json({ user: publicUser(user) }, 201);
});

usersRoute.put("/:id", async (c) => {
	const id = c.req.param("id");
	let body: {
		username?: string;
		password?: string;
		role?: string;
		disabled?: boolean;
	};
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	const db = getDb(c.env.DB);
	const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
	if (!existing) return c.json({ error: "User not found" }, 404);

	const updates: Partial<typeof users.$inferInsert> = { updatedAt: Date.now() };
	if (body.username !== undefined) {
		const username = body.username.trim();
		if (!username) return c.json({ error: "Username cannot be empty" }, 400);
		updates.username = username;
	}
	if (body.password) updates.passwordHash = await hashPassword(body.password);
	if (body.role !== undefined) {
		if (!isRole(body.role)) return c.json({ error: "Invalid role" }, 400);
		updates.role = body.role;
	}
	if (body.disabled !== undefined) {
		updates.disabledAt = body.disabled ? Date.now() : null;
	}

	await db.update(users).set(updates).where(eq(users.id, id));
	const updated = await db.query.users.findFirst({ where: eq(users.id, id) });
	return c.json({ user: updated ? publicUser(updated) : null });
});

export default usersRoute;
