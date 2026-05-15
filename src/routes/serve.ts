import { Hono } from "hono";
import { scripts } from "../lib/kv";
import type { Bindings } from "../types";

const serve = new Hono<{ Bindings: Bindings }>();

serve.get("/:key", async (c, next) => {
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

export default serve;
