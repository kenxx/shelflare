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

// AI 聊天（流式，支持 tool calling）
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

const SYSTEM_PROMPT =
	"你是一个 shell 脚本专家，帮助用户编写、调试和改进 bash/zsh/sh 脚本。" +
	"当用户要求保存脚本时，主动调用 save_script 工具。回答简洁，脚本用代码块包裹。";

const TOOLS = [
	{
		type: "function",
		function: {
			name: "save_script",
			description:
				"Save or update a shell script. Call this when the user asks to save, create, or update a script.",
			parameters: {
				type: "object",
				properties: {
					key: {
						type: "string",
						description:
							"Script name (alphanumeric, hyphens, underscores, no leading underscore)",
					},
					content: { type: "string", description: "Full shell script content" },
				},
				required: ["key", "content"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "read_script",
			description: "Read the content of an existing script by key.",
			parameters: {
				type: "object",
				properties: { key: { type: "string" } },
				required: ["key"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "list_scripts",
			description: "List all saved script names.",
			parameters: { type: "object", properties: {} },
		},
	},
];

type ToolCall = {
	index: number;
	id?: string;
	function?: { name?: string; arguments?: string };
};

api.post("/chat", requireAuth, async (c) => {
	const { messages, context } = await c.req.json<{
		messages: { role: string; content: string }[];
		context?: { key: string; content: string };
	}>();

	const kv = scripts(c.env.SCRIPTS);

	let sysPrompt = SYSTEM_PROMPT;
	if (context) {
		sysPrompt += `\n\n[当前编辑脚本: ${context.key}]\n\`\`\`bash\n${context.content}\n\`\`\``;
	}

	const history: object[] = [
		{ role: "system", content: sysPrompt },
		...messages,
	];
	const apiKey = c.env.DEEPSEEK_API_KEY;

	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();
	const enc = new TextEncoder();
	const dec = new TextDecoder();

	const run = async () => {
		try {
			// 流式调用，同时检测是否有 tool call
			const upstream = await fetch(DEEPSEEK_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: "deepseek-chat",
					messages: history,
					tools: TOOLS,
					stream: true,
				}),
			});

			const reader = (upstream.body ?? new ReadableStream()).getReader();
			const toolCallsMap = new Map<
				number,
				{ id: string; name: string; args: string }
			>();
			let hasToolCalls = false;
			let buf = "";

			outer: while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buf += dec.decode(value, { stream: true });
				const lines = buf.split("\n");
				buf = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const data = line.slice(6).trim();
					if (data === "[DONE]") break outer;

					let parsed: {
						choices?: {
							delta?: { content?: string; tool_calls?: ToolCall[] };
						}[];
					};
					try {
						parsed = JSON.parse(data);
					} catch {
						continue;
					}

					const delta = parsed.choices?.[0]?.delta;
					if (!delta) continue;

					if (delta.tool_calls) {
						hasToolCalls = true;
						for (const tc of delta.tool_calls) {
							const existing = toolCallsMap.get(tc.index);
							if (tc.id) {
								toolCallsMap.set(tc.index, {
									id: tc.id,
									name: tc.function?.name ?? "",
									args: tc.function?.arguments ?? "",
								});
							} else if (existing) {
								existing.args += tc.function?.arguments ?? "";
								if (tc.function?.name) existing.name = tc.function.name;
							}
						}
					} else if (delta.content && !hasToolCalls) {
						await writer.write(enc.encode(`data: ${data}\n\n`));
					}
				}
			}

			if (hasToolCalls && toolCallsMap.size > 0) {
				// 构建 assistant message 含 tool_calls
				history.push({
					role: "assistant",
					content: null,
					tool_calls: [...toolCallsMap.values()].map((tc) => ({
						id: tc.id,
						type: "function",
						function: { name: tc.name, arguments: tc.args },
					})),
				});

				// 执行每个 tool
				for (const tc of toolCallsMap.values()) {
					let result: string;
					try {
						const args = JSON.parse(tc.args) as Record<string, string>;
						if (tc.name === "save_script") {
							if (!KEY_RE.test(args.key ?? "")) {
								result = `Error: invalid key "${args.key}"`;
							} else {
								await kv.put(args.key, args.content ?? "");
								result = `Saved script "${args.key}" successfully.`;
							}
						} else if (tc.name === "read_script") {
							const content = await kv.get(args.key ?? "");
							result = content ?? `Script "${args.key}" not found.`;
						} else if (tc.name === "list_scripts") {
							const list = await kv.list();
							result = list.keys.length
								? list.keys.map((k) => k.name).join(", ")
								: "No scripts saved yet.";
						} else {
							result = `Unknown tool: ${tc.name}`;
						}
					} catch {
						result = "Tool execution error.";
					}
					history.push({ role: "tool", tool_call_id: tc.id, content: result });
				}

				// 最终流式调用返回文本（不带 tools 避免再次 tool call）
				const finalUpstream = await fetch(DEEPSEEK_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({
						model: "deepseek-chat",
						messages: history,
						stream: true,
					}),
				});

				const finalReader = (
					finalUpstream.body ?? new ReadableStream()
				).getReader();
				while (true) {
					const { done, value } = await finalReader.read();
					if (done) break;
					await writer.write(value);
				}
			} else {
				await writer.write(enc.encode("data: [DONE]\n\n"));
			}
		} finally {
			await writer.close().catch(() => {});
		}
	};

	c.executionCtx.waitUntil(run());

	return new Response(readable, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-store",
		},
	});
});

export default api;
