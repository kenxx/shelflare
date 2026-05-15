const KV_PREFIX = "SCRIPT_";

export function scripts(kv: KVNamespace) {
	return {
		get: (key: string) => kv.get(KV_PREFIX + key),
		put: (key: string, value: string) => kv.put(KV_PREFIX + key, value),
		delete: (key: string) => kv.delete(KV_PREFIX + key),
		list: () =>
			kv.list({ prefix: KV_PREFIX }).then((r) => ({
				list_complete: r.list_complete,
				keys: r.keys.map((k) => ({ name: k.name.slice(KV_PREFIX.length) })),
			})),
	};
}
