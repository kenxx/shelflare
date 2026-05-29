import type { UserRole } from "./db/schema";

export type AuthUser = {
	id: string;
	username: string;
	role: UserRole;
};

export type Bindings = CloudflareBindings & {
	JWT_SECRET: string;
	DEEPSEEK_API_KEY: string;
	DB: D1Database;
	SCRIPT_BUCKET: R2Bucket;
};

export type AppEnv = {
	Bindings: Bindings;
	Variables: {
		user: AuthUser;
	};
};
