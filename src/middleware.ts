import type { MiddlewareHandler } from "hono";
import { getBearerToken, verifyJwt } from "./lib/jwt";
import type { AppEnv } from "./types";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
	const token = getBearerToken(c);
	const payload = token ? await verifyJwt(token, c.env.JWT_SECRET) : null;
	if (!payload) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	c.set("user", {
		id: payload.sub,
		username: payload.username,
		role: payload.role,
	});
	return next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
	const user = c.get("user");
	if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
	return next();
};
