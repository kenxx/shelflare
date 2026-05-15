import type { MiddlewareHandler } from "hono";
import { getBearerToken, verifyJwt } from "./lib/jwt";
import type { Bindings } from "./types";

export const requireAuth: MiddlewareHandler<{ Bindings: Bindings }> = async (
	c,
	next,
) => {
	const token = getBearerToken(c);
	if (!token || !(await verifyJwt(token, c.env.ADMIN_PASSWORD))) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	return next();
};
