import { Hono } from "hono";
import { scripts } from "./lib/kv";
import api from "./routes/api";
import type { Bindings } from "./types";

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

// /_api：管理 API
app.route("/_api", api);

// /:key 脚本分发
app.get("/:key", async (c, next) => {
	const key = c.req.param("key") ?? "";

	const content = await scripts(c.env.SCRIPTS).get(key);
	if (content === null) return next();

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

export default app;
