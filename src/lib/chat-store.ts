import type { UIMessage } from "ai";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { type AppDb, getDb } from "../db";
import { chatMessages, chatThreads, scripts } from "../db/schema";
import type { Bindings } from "../types";

function now() {
	return Date.now();
}

function makeTitle(messages: UIMessage[]) {
	const firstUser = messages.find((message) => message.role === "user");
	const text = firstUser?.parts
		.filter((part) => part.type === "text")
		.map((part) => ("text" in part ? part.text : ""))
		.join(" ")
		.trim();
	if (!text) return "New chat";
	return text.length > 36 ? `${text.slice(0, 36)}...` : text;
}

function makeStoredMessages(threadId: string, messages: UIMessage[]) {
	return messages.map((message, index) => {
		return { ...message, id: `${threadId}:${index}` };
	});
}

export function chatStore(env: Bindings) {
	return createChatStore(getDb(env.DB));
}

export function createChatStore(db: AppDb) {
	return {
		async listThreads(userId: string) {
			const rows = await db
				.select({
					id: chatThreads.id,
					title: chatThreads.title,
					scriptId: chatThreads.scriptId,
					scriptKey: scripts.key,
					createdAt: chatThreads.createdAt,
					updatedAt: chatThreads.updatedAt,
				})
				.from(chatThreads)
				.leftJoin(scripts, eq(chatThreads.scriptId, scripts.id))
				.where(
					and(eq(chatThreads.userId, userId), isNull(chatThreads.archivedAt)),
				)
				.orderBy(desc(chatThreads.updatedAt));
			return rows;
		},

		async createThread(userId: string, scriptKey?: string | null) {
			const timestamp = now();
			let scriptId: string | null = null;
			if (scriptKey) {
				const script = await db.query.scripts.findFirst({
					where: eq(scripts.key, scriptKey),
				});
				scriptId = script?.id ?? null;
			}
			const thread = {
				id: crypto.randomUUID(),
				userId,
				title: "New chat",
				scriptId,
				createdAt: timestamp,
				updatedAt: timestamp,
				archivedAt: null,
			};
			await db.insert(chatThreads).values(thread);
			return thread;
		},

		async getThread(userId: string, threadId: string) {
			return db.query.chatThreads.findFirst({
				where: and(
					eq(chatThreads.id, threadId),
					eq(chatThreads.userId, userId),
				),
			});
		},

		async getMessages(
			userId: string,
			threadId: string,
		): Promise<UIMessage[] | null> {
			const thread = await this.getThread(userId, threadId);
			if (!thread || thread.archivedAt !== null) return null;
			const rows = await db
				.select()
				.from(chatMessages)
				.where(eq(chatMessages.threadId, threadId))
				.orderBy(asc(chatMessages.position));
			return rows.map((row) => ({
				id: row.id,
				role: row.role as UIMessage["role"],
				parts: JSON.parse(row.partsJson) as UIMessage["parts"],
			}));
		},

		async replaceMessages(
			userId: string,
			threadId: string,
			messages: UIMessage[],
		) {
			const thread = await this.getThread(userId, threadId);
			if (!thread || thread.archivedAt !== null) return null;
			if (messages.length === 0) return thread;

			const storedMessages = makeStoredMessages(threadId, messages);
			const timestamp = now();
			const title =
				thread.title === "New chat" ? makeTitle(storedMessages) : thread.title;
			await db.delete(chatMessages).where(eq(chatMessages.threadId, threadId));
			for (const [index, message] of storedMessages.entries()) {
				await db
					.insert(chatMessages)
					.values({
						id: message.id,
						threadId,
						role: message.role,
						partsJson: JSON.stringify(message.parts),
						position: index,
						createdAt: timestamp + index,
					})
					.onConflictDoNothing();
			}
			await db
				.update(chatThreads)
				.set({ title, updatedAt: timestamp })
				.where(eq(chatThreads.id, threadId));
			return { ...thread, title, updatedAt: timestamp };
		},

		async updateThread(
			userId: string,
			threadId: string,
			updates: { title?: string; scriptKey?: string | null },
		) {
			const thread = await this.getThread(userId, threadId);
			if (!thread) return null;
			let scriptId = thread.scriptId;
			if (updates.scriptKey !== undefined) {
				if (updates.scriptKey === null) {
					scriptId = null;
				} else {
					const script = await db.query.scripts.findFirst({
						where: eq(scripts.key, updates.scriptKey),
					});
					scriptId = script?.id ?? null;
				}
			}
			await db
				.update(chatThreads)
				.set({
					title: updates.title?.trim() || thread.title,
					scriptId,
					updatedAt: now(),
				})
				.where(eq(chatThreads.id, threadId));
			return this.getThread(userId, threadId);
		},

		async deleteThread(userId: string, threadId: string) {
			const thread = await this.getThread(userId, threadId);
			if (!thread) return null;
			await db.delete(chatThreads).where(eq(chatThreads.id, threadId));
			return thread;
		},
	};
}
