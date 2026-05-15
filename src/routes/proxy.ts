import { Hono } from "hono";
import type { Bindings } from "../types";

const ALLOW_LIST = [
	"raw.githubusercontent.com",
	"github.com",
	"api.github.com",
	"objects.githubusercontent.com",
];

const proxy = new Hono<{ Bindings: Bindings }>();

proxy.get("/*", async (c) => {
	const rawUrl = c.req.raw.url;
	const targetUrl = rawUrl.slice(
		rawUrl.indexOf("/_proxy/") + "/_proxy/".length,
	);

	if (!targetUrl) return c.text("Missing target URL", 400);

	let target: URL;
	try {
		target = new URL(targetUrl);
	} catch {
		return c.text("Invalid URL", 400);
	}

	if (target.protocol !== "https:") {
		return c.text("Only HTTPS URLs are allowed", 400);
	}

	if (!ALLOW_LIST.includes(target.hostname)) {
		return c.text(`Domain '${target.hostname}' not allowed`, 403);
	}

	const upstream = await fetch(target.toString(), {
		headers: { "User-Agent": "shelflare/1.0" },
	});

	const headers = new Headers(upstream.headers);
	headers.set("Cache-Control", "no-store");

	return new Response(upstream.body, { status: upstream.status, headers });
});

export default proxy;
