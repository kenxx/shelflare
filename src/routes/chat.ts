import { Hono } from "hono";
import { scripts } from "../lib/kv";
import { requireAuth } from "../middleware";
import type { Bindings } from "../types";

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

const SYSTEM_PROMPT =
	"你是 shelflare 的 AI 助手。shelflare 是一个基于 Cloudflare Workers 的 shell 脚本托管平台，" +
	"用户可以通过 `curl {origin}/{key} | sh` 直接拉取并执行脚本。\n\n" +
	"【Querystring 参数注入】\n" +
	"shelflare 支持通过 URL querystring 向脚本注入变量，例如：\n" +
	"  curl {origin}/{key}?VERSION=1.2.3&ENV=prod | sh\n" +
	"平台会在 shebang 行之后自动插入 `export VAR='value'` 声明，脚本可直接使用这些变量。\n" +
	"变量名须符合 shell 标识符规则（字母/下划线开头，只含字母数字下划线）。\n\n" +
	"编写脚本时的规范：\n" +
	"1. 在脚本顶部用注释列出所有支持的参数及说明，格式：\n" +
	"   # Parameters:\n" +
	"   #   VERSION  - 目标版本（默认: latest），示例: ?VERSION=1.2.3\n" +
	"   #   ENV      - 运行环境（默认: production）\n" +
	"2. 用 $\\{VAR:-default\\} 为参数设置默认值，不要假设变量一定存在\n" +
	"3. 推荐 `set -euo pipefail`，注意安全性和健壮性\n\n" +
	"【GitHub 代理】\n" +
	"shelflare 内置了 GitHub 代理，路径为 `{origin}/_proxy/<url>`，仅允许以下域名：\n" +
	"  raw.githubusercontent.com、github.com、api.github.com、objects.githubusercontent.com\n" +
	"用途：脚本中需要从 GitHub 下载文件时（如 release 二进制、raw 脚本），用代理替换直连，" +
	"解决用户网络无法访问 GitHub 的问题。\n" +
	"示例：\n" +
	"  原始：curl https://raw.githubusercontent.com/owner/repo/main/install.sh | sh\n" +
	"  代理：curl {origin}/_proxy/https://raw.githubusercontent.com/owner/repo/main/install.sh | sh\n" +
	"脚本内下载同理：将 wget/curl 的 GitHub URL 前加 `{origin}/_proxy/` 即可。\n" +
	"当用户提到从 GitHub 下载、安装 release、或网络访问 GitHub 有问题时，主动使用代理 URL。\n\n" +
	"其他注意事项：\n" +
	"- 无论是否有当前脚本，用户都可以直接描述需求，你来创建并保存\n" +
	"- 创建新脚本：直接调用 save_script，立即生效\n" +
	"- 修改已有脚本（上下文中有当前脚本）：save_script 会保存为草稿，用户 Accept 后才生效\n" +
	"- 当用户要求修改或保存脚本时，主动调用 save_script 工具，不要等用户再次确认\n" +
	"- key 只能包含字母、数字、连字符和下划线，以字母或数字开头\n" +
	"- 保存后告知用户执行命令，格式为 `curl {origin}/{key} | sh`\n" +
	"- 回答简洁，脚本用代码块包裹";

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

const chat = new Hono<{ Bindings: Bindings }>();

chat.post("/", requireAuth, async (c) => {
	const { messages, context } = await c.req.json<{
		messages: { role: string; content: string }[];
		context?: { key: string; content: string };
	}>();

	const kv = scripts(c.env.SCRIPTS);
	const origin = new URL(c.req.url).origin;

	let sysPrompt = SYSTEM_PROMPT.replaceAll("{origin}", origin);
	if (context) {
		sysPrompt += `\n\n[当前编辑脚本: ${context.key}]\n执行命令: curl ${origin}/${context.key} | sh\n\`\`\`bash\n${context.content}\n\`\`\``;
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
				history.push({
					role: "assistant",
					content: null,
					tool_calls: [...toolCallsMap.values()].map((tc) => ({
						id: tc.id,
						type: "function",
						function: { name: tc.name, arguments: tc.args },
					})),
				});

				for (const tc of toolCallsMap.values()) {
					let result: string;
					try {
						const args = JSON.parse(tc.args) as Record<string, string>;
						if (tc.name === "save_script") {
							if (!KEY_RE.test(args.key ?? "")) {
								result = `Error: invalid key "${args.key}"`;
							} else if (context?.key === args.key) {
								await c.env.SCRIPTS.put(
									`unsaved:${args.key}`,
									args.content ?? "",
								);
								result = `Saved draft for "${args.key}". The user will review and accept or reject the change.`;
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

export default chat;
