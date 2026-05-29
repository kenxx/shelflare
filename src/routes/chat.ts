import { Hono } from "hono";
import {
	type ChatRequest,
	mergeWithPersistedMessages,
	streamChatCompletion,
} from "../chat/ai";
import { chatStore } from "../chat/store";
import { requireAuth } from "../middleware";
import type { AppEnv } from "../types";

const chat = new Hono<AppEnv>();

chat.post("/", requireAuth, async (c) => {
	const { messages, context, threadId, system }: ChatRequest =
		await c.req.json();

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

	const result = await streamChatCompletion({
		env: c.env,
		origin: new URL(c.req.url).origin,
		user: currentUser,
		messages: promptMessages,
		context,
		system,
	});

	return result.toUIMessageStreamResponse({
		headers: { "Cache-Control": "no-store" },
		originalMessages: promptMessages,
		onFinish: async ({ messages: updatedMessages }) => {
			if (!threadId) return;
			try {
				await chatStore(c.env).replaceMessages(
					currentUser.id,
					threadId,
					updatedMessages,
				);
			} catch (error) {
				console.error("Failed to persist chat messages", error);
			}
		},
	});
});

export default chat;
