import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	convertToModelMessages,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai";
import type { AuthUser, Bindings } from "../types";
import { buildSystemPrompt, type ScriptContext } from "./prompt";
import { createScriptTools } from "./script-tools";

export type ChatRequest = {
	messages: UIMessage[];
	context?: ScriptContext | null;
	threadId?: string;
	system?: string;
};

export function mergeWithPersistedMessages(
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

export async function streamChatCompletion({
	env,
	origin,
	user,
	messages,
	context,
	system,
}: {
	env: Bindings;
	origin: string;
	user: AuthUser;
	messages: UIMessage[];
	context?: ScriptContext | null;
	system?: string;
}) {
	const deepseek = createOpenAICompatible({
		name: "deepseek",
		apiKey: env.DEEPSEEK_API_KEY,
		baseURL: "https://api.deepseek.com/v1",
	});

	return streamText({
		model: deepseek("deepseek-chat"),
		system: buildSystemPrompt({ origin, system, context }),
		messages: await convertToModelMessages(messages),
		tools: createScriptTools({ env, origin, user }),
		stopWhen: stepCountIs(5),
	});
}
