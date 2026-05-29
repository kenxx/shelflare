import { and, desc, eq } from "drizzle-orm";
import { type AppDb, getDb } from "../db";
import {
	type Script,
	scriptDrafts,
	scripts as scriptsTable,
} from "../db/schema";
import type { Bindings } from "../types";

export const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function scriptObjectKey(scriptId: string) {
	return `scripts/${scriptId}.sh`;
}

function now() {
	return Date.now();
}

function toHex(buffer: ArrayBuffer) {
	return [...new Uint8Array(buffer)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function sha256(content: string) {
	return toHex(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)),
	);
}

async function readScriptObject(bucket: R2Bucket, script: Script) {
	const object = await bucket.get(script.r2Key);
	if (!object) return null;
	return object.text();
}

async function writeScriptObject(
	bucket: R2Bucket,
	r2Key: string,
	content: string,
) {
	await bucket.put(r2Key, content, {
		httpMetadata: { contentType: "text/plain; charset=utf-8" },
	});
}

export function scriptStore(env: Bindings) {
	const db = getDb(env.DB);
	return createScriptStore(db, env.SCRIPT_BUCKET);
}

export function createScriptStore(db: AppDb, bucket: R2Bucket) {
	return {
		async list() {
			const rows = await db
				.select()
				.from(scriptsTable)
				.orderBy(desc(scriptsTable.updatedAt));
			return {
				list_complete: true,
				keys: rows.map((script) => ({ name: script.key })),
			};
		},

		async getByKey(key: string) {
			return db.query.scripts.findFirst({
				where: eq(scriptsTable.key, key),
			});
		},

		async getContent(key: string) {
			const script = await this.getByKey(key);
			if (!script) return null;
			const content = await readScriptObject(bucket, script);
			if (content === null) return { missingObject: true as const, script };
			return { key: script.key, content, script };
		},

		async create(key: string, content: string, ownerId: string) {
			const id = crypto.randomUUID();
			const r2Key = scriptObjectKey(id);
			const timestamp = now();
			await writeScriptObject(bucket, r2Key, content);
			await db.insert(scriptsTable).values({
				id,
				key,
				ownerId,
				r2Key,
				size: new TextEncoder().encode(content).byteLength,
				sha256: await sha256(content),
				createdAt: timestamp,
				updatedAt: timestamp,
			});
			return { id, key, r2Key };
		},

		async update(key: string, content: string) {
			const script = await this.getByKey(key);
			if (!script) return null;
			await writeScriptObject(bucket, script.r2Key, content);
			await db
				.update(scriptsTable)
				.set({
					size: new TextEncoder().encode(content).byteLength,
					sha256: await sha256(content),
					updatedAt: now(),
				})
				.where(eq(scriptsTable.id, script.id));
			return { ...script, content };
		},

		async delete(key: string) {
			const script = await this.getByKey(key);
			if (!script) return null;
			await bucket.delete(script.r2Key);
			await db.delete(scriptsTable).where(eq(scriptsTable.id, script.id));
			return script;
		},

		async getDraft(key: string, userId: string) {
			const script = await this.getByKey(key);
			if (!script) return null;
			return db.query.scriptDrafts.findFirst({
				where: and(
					eq(scriptDrafts.scriptId, script.id),
					eq(scriptDrafts.userId, userId),
				),
			});
		},

		async upsertDraft(key: string, userId: string, draftContent: string) {
			const current = await this.getContent(key);
			if (!current || "missingObject" in current) return null;
			const existing = await this.getDraft(key, userId);
			const timestamp = now();
			if (existing) {
				await db
					.update(scriptDrafts)
					.set({ draftContent, updatedAt: timestamp })
					.where(eq(scriptDrafts.id, existing.id));
				return { ...existing, draftContent, updatedAt: timestamp };
			}

			const draft = {
				id: crypto.randomUUID(),
				scriptId: current.script.id,
				userId,
				baseContent: current.content,
				draftContent,
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			await db.insert(scriptDrafts).values(draft);
			return draft;
		},

		async deleteDraft(key: string, userId: string) {
			const draft = await this.getDraft(key, userId);
			if (!draft) return null;
			await db.delete(scriptDrafts).where(eq(scriptDrafts.id, draft.id));
			return draft;
		},
	};
}
