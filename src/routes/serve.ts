import { Hono } from "hono";
import { scriptStore } from "../lib/scripts-store";
import type { AppEnv } from "../types";

const serve = new Hono<AppEnv>();

serve.get("/:key", async (c, next) => {
	const key = c.req.param("key") ?? "";

	const result = await scriptStore(c.env).getContent(key);
	if (result === null) return next();
	if ("missingObject" in result) return c.text("Script content missing", 500);
	const { content } = result;

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

export default serve;
