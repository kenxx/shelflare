const SCRIPT_KEY_PREFIX = "script:";
const INDEX_KEY = "_index";

async function readIndex(kv: KVNamespace): Promise<string[]> {
	const raw = await kv.get(INDEX_KEY);
	if (!raw) return [];
	try {
		return JSON.parse(raw) as string[];
	} catch {
		return [];
	}
}

async function writeIndex(kv: KVNamespace, keys: string[]): Promise<void> {
	await kv.put(INDEX_KEY, JSON.stringify(keys));
}

export function scripts(kv: KVNamespace) {
	return {
		get: (key: string) => kv.get(SCRIPT_KEY_PREFIX + key),

		put: async (key: string, value: string): Promise<void> => {
			await kv.put(SCRIPT_KEY_PREFIX + key, value);
			const index = await readIndex(kv);
			if (!index.includes(key)) {
				await writeIndex(kv, [...index, key]);
			}
		},

		delete: async (key: string): Promise<void> => {
			await kv.delete(SCRIPT_KEY_PREFIX + key);
			const index = await readIndex(kv);
			await writeIndex(
				kv,
				index.filter((k) => k !== key),
			);
		},

		list: async () => {
			const keys = await readIndex(kv);
			return {
				list_complete: true,
				keys: keys.map((name) => ({ name })),
			};
		},
	};
}
