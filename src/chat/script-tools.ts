import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { AuthUser, Bindings } from "../types";
import { KEY_RE, scriptStore } from "../scripts/store";
import { applyUnifiedDiff } from "../utils/unified-diff";
import { countOccurrences, replaceExact } from "./text-edit";

function formatWithLineNumbers(
	content: string,
	startLine = 1,
	endLine?: number,
): { content: string; totalLines: number; startLine: number; endLine: number } {
	const lines = content.split("\n");
	const total = lines.length;
	const from = Math.max(1, startLine);
	const to = Math.min(total, endLine ?? total);
	const slice = lines.slice(from - 1, to);
	const formatted = slice
		.map((line, i) => `${from + i}|${line}`)
		.join("\n");
	return { content: formatted, totalLines: total, startLine: from, endLine: to };
}

export function createScriptTools({
	env,
	origin,
	user,
}: {
	env: Bindings;
	origin: string;
	user: AuthUser;
}) {
	const store = scriptStore(env);

	return {
		read: tool({
			description:
				"Read the content of one existing saved script by key. Returns content with line numbers (format: N|line). Supports optional line range to read a subset.",
			inputSchema: zodSchema(
				z.object({
					key: z.string().describe("Existing script key to read."),
					start_line: z
						.number()
						.int()
						.min(1)
						.optional()
						.describe("First line to return (1-based, inclusive). Defaults to 1."),
					end_line: z
						.number()
						.int()
						.min(1)
						.optional()
						.describe("Last line to return (1-based, inclusive). Defaults to end of file."),
				}),
			),
			execute: async ({ key, start_line, end_line }) => {
				if (!KEY_RE.test(key)) {
					return { ok: false, error: `Invalid script key: ${key}` };
				}
				const result = await store.getContent(key);
				if (!result || "missingObject" in result) {
					return { ok: false, error: `Script "${key}" not found.` };
				}
				const formatted = formatWithLineNumbers(result.content, start_line, end_line);
				return { ok: true, key, ...formatted };
			},
		}),
		search: tool({
			description:
				"Search within one existing saved script by exact text. Use this before editing when you only need a small snippet.",
			inputSchema: zodSchema(
				z.object({
					key: z.string().describe("Existing script key to search."),
					query: z.string().describe("Exact text to search for."),
					case_sensitive: z
						.boolean()
						.optional()
						.describe("Whether matching is case-sensitive. Defaults to true."),
					max_results: z
						.number()
						.int()
						.min(1)
						.max(20)
						.optional()
						.describe("Maximum number of matches to return. Defaults to 10."),
				}),
			),
			execute: async ({ key, query, case_sensitive, max_results }) => {
				if (!KEY_RE.test(key)) {
					return { ok: false, error: `Invalid script key: ${key}` };
				}
				if (query.length === 0) {
					return { ok: false, error: "query cannot be empty." };
				}

				const result = await store.getContent(key);
				if (!result || "missingObject" in result) {
					return { ok: false, error: `Script "${key}" not found.` };
				}

				const haystack =
					case_sensitive === false
						? result.content.toLowerCase()
						: result.content;
				const needle = case_sensitive === false ? query.toLowerCase() : query;
				const lines = result.content.split("\n");
				const matches: Array<{ line: number; text: string }> = [];
				const limit = max_results ?? 10;
				for (const [index, line] of lines.entries()) {
					const comparableLine =
						case_sensitive === false ? line.toLowerCase() : line;
					if (comparableLine.includes(needle)) {
						matches.push({ line: index + 1, text: line });
						if (matches.length >= limit) break;
					}
				}

				return {
					ok: true,
					key,
					query,
					count: countOccurrences(haystack, needle),
					matches,
				};
			},
		}),
		write: tool({
			description:
				"Write the full content of one script. Creates a missing script immediately; for an existing script, saves a reviewable draft instead of changing the live script.",
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

				const existing = await store.getByKey(key);
				if (existing) {
					const draft = await store.upsertDraft(key, user.id, content);
					if (!draft) return { ok: false, error: `Script "${key}" not found.` };
					return {
						ok: true,
						key,
						status: "draft",
						message:
							"Saved a full-script draft for review. The user will accept or reject the change.",
					};
				}

				await store.create(key, content, user.id);
				return {
					ok: true,
					key,
					status: "created",
					command: `curl ${origin}/${key} | sh`,
				};
			},
		}),
		edit: tool({
			description:
				"Edit one existing script by replacing an exact string. Best for a single small change. Saves a reviewable draft.",
			inputSchema: zodSchema(
				z.object({
					key: z
						.string()
						.describe(
							"Existing script key to update: letters, numbers, hyphens, and underscores; must start with a letter or number.",
						),
					old_text: z
						.string()
						.describe("Exact text currently present in the script."),
					new_text: z.string().describe("Replacement text."),
					replace_all: z
						.boolean()
						.optional()
						.describe("Replace every exact match. Defaults to false."),
				}),
			),
			execute: async ({ key, old_text, new_text, replace_all }) => {
				if (!KEY_RE.test(key)) {
					return { ok: false, error: `Invalid script key: ${key}` };
				}

				const current = await store.getContent(key);
				if (!current || "missingObject" in current) {
					return { ok: false, error: `Script "${key}" not found.` };
				}
				const edited = replaceExact(current.content, old_text, new_text, {
					replaceAll: replace_all,
				});
				if (!edited.ok) {
					return { ok: false, error: `Edit failed: ${edited.error}` };
				}

				const draft = await store.upsertDraft(key, user.id, edited.content);
				if (!draft) return { ok: false, error: `Script "${key}" not found.` };
				return {
					ok: true,
					key,
					status: "draft",
					message:
						"Saved an edit draft for review. The user will accept or reject the change.",
				};
			},
		}),
		apply_patch: tool({
			description:
				"Apply a unified diff patch to one existing script. Use only for simple, local changes; use write for complex rewrites. Saves a reviewable draft.",
			inputSchema: zodSchema(
				z.object({
					key: z
						.string()
						.describe(
							"Existing script key to patch: letters, numbers, hyphens, and underscores; must start with a letter or number.",
						),
					patch: z
						.string()
						.describe(
							"Unified diff patch against the current saved script content. Include --- and +++ file headers and at least one @@ hunk.",
						),
				}),
			),
			execute: async ({ key, patch }) => {
				if (!KEY_RE.test(key)) {
					return { ok: false, error: `Invalid script key: ${key}` };
				}

				const current = await store.getContent(key);
				if (!current || "missingObject" in current) {
					return { ok: false, error: `Script "${key}" not found.` };
				}
				const patched = applyUnifiedDiff(current.content, patch);
				if (!patched.ok) {
					return {
						ok: false,
						error: `Patch failed: ${patched.error}`,
					};
				}

				const draft = await store.upsertDraft(key, user.id, patched.content);
				if (!draft) return { ok: false, error: `Script "${key}" not found.` };
				return {
					ok: true,
					key,
					status: "draft",
					appliedPatch: true,
					message:
						"Saved a patch draft for review. The user will accept or reject the change.",
				};
			},
		}),
		list: tool({
			description: "List all saved script keys.",
			inputSchema: zodSchema(z.object({})),
			execute: async () => {
				const list = await store.list();
				return { ok: true, scripts: list.keys.map((k) => k.name) };
			},
		}),
	};
}
