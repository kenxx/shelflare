import { relations } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
	"users",
	{
		id: text("id").primaryKey(),
		username: text("username").notNull(),
		passwordHash: text("password_hash").notNull(),
		role: text("role", { enum: ["admin", "user"] })
			.notNull()
			.default("user"),
		disabledAt: integer("disabled_at"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [uniqueIndex("users_username_idx").on(table.username)],
);

export const scripts = sqliteTable(
	"scripts",
	{
		id: text("id").primaryKey(),
		key: text("key").notNull(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => users.id),
		r2Key: text("r2_key").notNull(),
		size: integer("size").notNull(),
		sha256: text("sha256").notNull(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("scripts_key_idx").on(table.key),
		index("scripts_owner_idx").on(table.ownerId),
	],
);

export const scriptDrafts = sqliteTable(
	"script_drafts",
	{
		id: text("id").primaryKey(),
		scriptId: text("script_id")
			.notNull()
			.references(() => scripts.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		baseContent: text("base_content").notNull(),
		draftContent: text("draft_content").notNull(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("script_drafts_script_user_idx").on(
			table.scriptId,
			table.userId,
		),
		index("script_drafts_user_idx").on(table.userId),
	],
);

export const chatThreads = sqliteTable(
	"chat_threads",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		scriptId: text("script_id").references(() => scripts.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
		archivedAt: integer("archived_at"),
	},
	(table) => [
		index("chat_threads_user_updated_idx").on(
			table.userId,
			table.updatedAt,
		),
		index("chat_threads_script_idx").on(table.scriptId),
	],
);

export const chatMessages = sqliteTable(
	"chat_messages",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => chatThreads.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		partsJson: text("parts_json").notNull(),
		position: integer("position").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		uniqueIndex("chat_messages_thread_position_idx").on(
			table.threadId,
			table.position,
		),
		index("chat_messages_thread_idx").on(table.threadId),
	],
);

export const usersRelations = relations(users, ({ many }) => ({
	scripts: many(scripts),
	threads: many(chatThreads),
}));

export const scriptsRelations = relations(scripts, ({ one, many }) => ({
	owner: one(users, {
		fields: [scripts.ownerId],
		references: [users.id],
	}),
	drafts: many(scriptDrafts),
	threads: many(chatThreads),
}));

export const scriptDraftsRelations = relations(scriptDrafts, ({ one }) => ({
	script: one(scripts, {
		fields: [scriptDrafts.scriptId],
		references: [scripts.id],
	}),
	user: one(users, {
		fields: [scriptDrafts.userId],
		references: [users.id],
	}),
}));

export const chatThreadsRelations = relations(chatThreads, ({ one, many }) => ({
	user: one(users, {
		fields: [chatThreads.userId],
		references: [users.id],
	}),
	script: one(scripts, {
		fields: [chatThreads.scriptId],
		references: [scripts.id],
	}),
	messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
	thread: one(chatThreads, {
		fields: [chatMessages.threadId],
		references: [chatThreads.id],
	}),
}));

export type UserRole = "admin" | "user";
export type User = typeof users.$inferSelect;
export type Script = typeof scripts.$inferSelect;
export type ChatThread = typeof chatThreads.$inferSelect;
