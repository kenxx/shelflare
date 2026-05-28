import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	convertToModelMessages,
	stepCountIs,
	streamText,
	tool,
	type UIMessage,
	zodSchema,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";
import { chatStore } from "../lib/chat-store";
import { KEY_RE, scriptStore } from "../lib/scripts-store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";

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
	"- 用户说“写一个脚本”“创建一个脚本”“做一个安装脚本”等，默认是在新建脚本；生成完整脚本后直接调用 new_script 保存，不要只把脚本发在聊天里\n" +
	"- 新建脚本：调用 new_script，立即生效；new_script 只用于创建新 key，不能覆盖已有脚本\n" +
	"- 修改已有脚本：只有当用户明确指定脚本 key，或当前上下文中有正在编辑的脚本时，才调用 update_script\n" +
	"- 修改当前上下文脚本时，update_script 会保存为草稿，用户 Accept 后才生效\n" +
	"- 当用户要求修改但没有明确目标脚本，也没有当前上下文脚本时，先询问要修改哪个 key，不要新建脚本代替\n" +
	"- key 只能包含字母、数字、连字符和下划线，以字母或数字开头\n" +
	"- 保存后告知用户执行命令，格式为 `curl {origin}/{key} | sh`\n" +
	"- 回答简洁，脚本用代码块包裹";

type ScriptContext = {
	key: string;
	content: string;
};

function mergeWithPersistedMessages(
	persistedMessages: UIMessage[],
	requestMessages: UIMessage[],
) {
	if (persistedMessages.length === 0) return requestMessages;
	if (requestMessages.length === 0) return persistedMessages;

	const persistedIds = new Set(persistedMessages.map((message) => message.id));
	const hasPersistedMessage = requestMessages.some((message) =>
		persistedIds.has(message.id),
	);

	if (!hasPersistedMessage) {
		return [...persistedMessages, ...requestMessages];
	}

	return [
		...persistedMessages.map(
			(message) =>
				requestMessages.find(
					(requestMessage) => requestMessage.id === message.id,
				) ?? message,
		),
		...requestMessages.filter((message) => !persistedIds.has(message.id)),
	];
}

const chat = new Hono<AppEnv>();

chat.post("/", requireAuth, async (c) => {
	const {
		messages,
		context,
		threadId,
		system,
	}: {
		messages: UIMessage[];
		context?: ScriptContext | null;
		threadId?: string;
		system?: string;
	} = await c.req.json();

	const currentUser = c.get("user");
	let promptMessages = messages;
	if (threadId) {
		const persistedMessages = await chatStore(c.env).getMessages(
			currentUser.id,
			threadId,
		);
		if (!persistedMessages) return c.json({ error: "Thread not found" }, 404);
		promptMessages = mergeWithPersistedMessages(persistedMessages, messages);
	}

	const store = scriptStore(c.env);
	const origin = new URL(c.req.url).origin;
	const deepseek = createOpenAICompatible({
		name: "deepseek",
		apiKey: c.env.DEEPSEEK_API_KEY,
		baseURL: "https://api.deepseek.com/v1",
	});

	let sysPrompt = SYSTEM_PROMPT.replaceAll("{origin}", origin);
	if (system) sysPrompt += `\n\n${system}`;
	if (context) {
		sysPrompt += `\n\n[当前编辑脚本: ${context.key}]\n执行命令: curl ${origin}/${context.key} | sh\n\`\`\`bash\n${context.content}\n\`\`\``;
	}

	const tools = {
		new_script: tool({
			description:
				"Create and save a new shell script. Use this when the user asks to write, create, or save a new script. Do not use it to update an existing script.",
			inputSchema: zodSchema(
				z.object({
					key: z
						.string()
						.describe(
							"Script name: letters, numbers, hyphens, and underscores; must start with a letter or number.",
						),
					content: z.string().describe("Full shell script content."),
				}),
			),
			execute: async ({ key, content }) => {
				if (!KEY_RE.test(key)) {
					return { ok: false, error: `Invalid script key: ${key}` };
				}

				if (await store.getByKey(key)) {
					return {
						ok: false,
						error: `Script "${key}" already exists. Use update_script to modify it.`,
					};
				}

				await store.create(key, content, currentUser.id);
				return {
					ok: true,
					key,
					status: "created",
					command: `curl ${origin}/${key} | sh`,
				};
			},
		}),
		update_script: tool({
			description:
				"Update an existing shell script. Use this only when the user explicitly names an existing script key, or when editing the current script from context.",
			inputSchema: zodSchema(
				z.object({
					key: z
						.string()
						.describe(
							"Existing script key to update: letters, numbers, hyphens, and underscores; must start with a letter or number.",
						),
					content: z
						.string()
						.describe("Full replacement shell script content."),
				}),
			),
			execute: async ({ key, content }) => {
				if (!KEY_RE.test(key)) {
					return { ok: false, error: `Invalid script key: ${key}` };
				}

				if (context?.key === key) {
					const draft = await store.upsertDraft(key, currentUser.id, content);
					if (!draft) return { ok: false, error: `Script "${key}" not found.` };
					return {
						ok: true,
						key,
						status: "draft",
						message:
							"Saved a draft for the current script. The user will review and accept or reject the change.",
					};
				}

				const updated = await store.update(key, content);
				if (!updated) return { ok: false, error: `Script "${key}" not found.` };
				return {
					ok: true,
					key,
					status: "updated",
					command: `curl ${origin}/${key} | sh`,
				};
			},
		}),
		read_script: tool({
			description: "Read the content of an existing saved script by key.",
			inputSchema: zodSchema(z.object({ key: z.string() })),
			execute: async ({ key }) => {
				const result = await store.getContent(key);
				if (!result || "missingObject" in result) {
					return { ok: false, error: `Script "${key}" not found.` };
				}
				return { ok: true, key, content: result.content };
			},
		}),
		list_scripts: tool({
			description: "List all saved script names.",
			inputSchema: zodSchema(z.object({})),
			execute: async () => {
				const list = await store.list();
				return { ok: true, scripts: list.keys.map((key) => key.name) };
			},
		}),
	};

	const result = streamText({
		model: deepseek("deepseek-chat"),
		system: sysPrompt,
		messages: await convertToModelMessages(promptMessages),
		tools,
		stopWhen: stepCountIs(5),
	});

	return result.toUIMessageStreamResponse({
		headers: { "Cache-Control": "no-store" },
		originalMessages: promptMessages,
		onFinish: async ({ messages: updatedMessages }) => {
			if (!threadId) return;
			await chatStore(c.env).replaceMessages(
				currentUser.id,
				threadId,
				updatedMessages,
			);
		},
	});
});

export default chat;
