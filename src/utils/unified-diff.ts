import { applyPatch, parsePatch } from "diff";

function normalizeHunkHeaders(patch: string) {
	const lines = patch.replace(/\r\n/g, "\n").split("\n");
	const normalized: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const header = lines[index];
		const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(header);
		if (!match) {
			normalized.push(header);
			index++;
			continue;
		}

		const body: string[] = [];
		index++;
		while (index < lines.length && !lines[index].startsWith("@@ ")) {
			body.push(lines[index]);
			index++;
		}

		let oldLineCount = 0;
		let newLineCount = 0;
		for (const line of body) {
			if (line.startsWith("\\ No newline at end of file")) continue;
			if (line.startsWith(" ")) {
				oldLineCount++;
				newLineCount++;
			} else if (line.startsWith("-")) {
				oldLineCount++;
			} else if (line.startsWith("+")) {
				newLineCount++;
			}
		}

		normalized.push(
			`@@ -${match[1]},${oldLineCount} +${match[2]},${newLineCount} @@${match[3]}`,
		);
		normalized.push(...body);
	}

	return normalized.join("\n");
}

export function applyUnifiedDiff(original: string, patch: string) {
	const normalizedPatch = normalizeHunkHeaders(patch);
	let parsed: ReturnType<typeof parsePatch>;
	try {
		parsed = parsePatch(normalizedPatch);
	} catch (error) {
		return {
			ok: false as const,
			error:
				error instanceof Error
					? `Invalid patch: ${error.message}`
					: "Invalid patch.",
		};
	}

	if (parsed.length !== 1) {
		return {
			ok: false as const,
			error: "Patch must target exactly one file.",
		};
	}

	const [filePatch] = parsed;
	if (!filePatch.oldFileName || !filePatch.newFileName) {
		return {
			ok: false as const,
			error: "Patch must include --- and +++ file headers.",
		};
	}
	if (filePatch.hunks.length === 0) {
		return {
			ok: false as const,
			error: "Patch does not contain any hunks.",
		};
	}

	const content = applyPatch(original, filePatch, { fuzzFactor: 0 });
	if (content === false) {
		return {
			ok: false as const,
			error: "Patch hunks did not match the current script content.",
		};
	}

	return { ok: true as const, content };
}
