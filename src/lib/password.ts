const ITERATIONS = 210_000;
const HASH = "SHA-256";
const ALGORITHM = "pbkdf2_sha256";

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: HASH,
			salt,
			iterations: ITERATIONS,
		},
		key,
		256,
	);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derivePassword(password, salt);
	return [ALGORITHM, ITERATIONS, bytesToBase64(salt), bytesToBase64(hash)].join(
		"$",
	);
}

export async function verifyPassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const [algorithm, iterations, salt, expected] = stored.split("$");
	if (algorithm !== ALGORITHM || Number(iterations) !== ITERATIONS)
		return false;
	if (!salt || !expected) return false;

	const actualHash = await derivePassword(password, base64ToBytes(salt));
	const expectedHash = base64ToBytes(expected);
	if (actualHash.length !== expectedHash.length) return false;
	return crypto.subtle.timingSafeEqual(actualHash, expectedHash);
}
