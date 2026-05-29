export function countOccurrences(content: string, text: string) {
	if (text.length === 0) return 0;
	let count = 0;
	let index = content.indexOf(text);
	while (index !== -1) {
		count++;
		index = content.indexOf(text, index + text.length);
	}
	return count;
}

export function replaceExact(
	content: string,
	oldText: string,
	newText: string,
	options?: { replaceAll?: boolean },
) {
	if (oldText.length === 0) {
		return { ok: false as const, error: "old_text cannot be empty." };
	}

	const occurrences = countOccurrences(content, oldText);
	if (occurrences === 0) {
		return { ok: false as const, error: "old_text was not found." };
	}
	if (!options?.replaceAll && occurrences !== 1) {
		return {
			ok: false as const,
			error: `old_text matched ${occurrences} times. Provide a more specific string or set replace_all.`,
		};
	}

	return {
		ok: true as const,
		content: options?.replaceAll
			? content.split(oldText).join(newText)
			: content.replace(oldText, newText),
	};
}
