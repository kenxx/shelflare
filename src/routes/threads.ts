import { Hono } from "hono";
import { chatStore } from "../lib/chat-store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";

const threads = new Hono<AppEnv>();

threads.use("*", requireAuth);

threads.get("/", async (c) => {
	const rows = await chatStore(c.env).listThreads(c.get("user").id);
	return c.json({ threads: rows });
});

threads.post("/", async (c) => {
	let body: { scriptKey?: string | null };
	try {
		body = await c.req.json();
	} catch {
		body = {};
	}
	const thread = await chatStore(c.env).createThread(
		c.get("user").id,
		body.scriptKey ?? null,
	);
	return c.json({ thread }, 201);
});

threads.get("/:id/messages", async (c) => {
	const messages = await chatStore(c.env).getMessages(
		c.get("user").id,
		c.req.param("id"),
	);
	if (!messages) return c.json({ error: "Thread not found" }, 404);
	return c.json({ messages });
});

threads.put("/:id", async (c) => {
	let body: { title?: string; scriptKey?: string | null };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	const thread = await chatStore(c.env).updateThread(
		c.get("user").id,
		c.req.param("id"),
		body,
	);
	if (!thread) return c.json({ error: "Thread not found" }, 404);
	return c.json({ thread });
});

threads.delete("/:id", async (c) => {
	const thread = await chatStore(c.env).deleteThread(
		c.get("user").id,
		c.req.param("id"),
	);
	if (!thread) return c.json({ error: "Thread not found" }, 404);
	return c.json({ success: true });
});

export default threads;
