const BASE = "/_api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res;
}

export interface ScriptKey {
  name: string;
}

export interface ListResponse {
  keys: ScriptKey[];
  list_complete: boolean;
}

export interface CurrentUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

export interface UserRecord extends CurrentUser {
  disabledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatThread {
  id: string;
  title: string;
  scriptId: string | null;
  scriptKey: string | null;
  createdAt: number;
  updatedAt: number;
}

export const api = {
  login: async (username: string, password: string): Promise<CurrentUser> => {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error: string }).error ?? res.statusText);
    }
    const { token, user } = (await res.json()) as { token: string; user: CurrentUser };
    localStorage.setItem("token", token);
    return user;
  },

  logout: (): void => {
    localStorage.removeItem("token");
    fetch(`${BASE}/logout`, { method: "POST" }).catch(() => {});
  },

  me: () => apiFetch("/me").then((r) => r.json() as Promise<{ ok: boolean; user: CurrentUser }>),

  listUsers: () =>
    apiFetch("/users").then((r) => r.json() as Promise<{ users: UserRecord[] }>),

  createUser: (input: { username: string; password: string; role: CurrentUser["role"] }) =>
    apiFetch("/users", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.json() as Promise<{ user: UserRecord }>),

  updateUser: (
    id: string,
    input: Partial<{ username: string; password: string; role: CurrentUser["role"]; disabled: boolean }>,
  ) =>
    apiFetch(`/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.json() as Promise<{ user: UserRecord | null }>),

  listScripts: () =>
    apiFetch("/scripts").then((r) => r.json() as Promise<ListResponse>),

  getScript: (key: string) =>
    apiFetch(`/scripts/${encodeURIComponent(key)}`).then(
      (r) => r.json() as Promise<{ key: string; content: string }>
    ),

  createScript: (key: string, content: string) =>
    apiFetch("/scripts", {
      method: "POST",
      body: JSON.stringify({ key, content }),
    }).then((r) => r.json()),

  updateScript: (key: string, content: string) =>
    apiFetch(`/scripts/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }).then((r) => r.json()),

  deleteScript: (key: string) =>
    apiFetch(`/scripts/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }).then((r) => r.json()),

  getUnsavedScript: (key: string) =>
    apiFetch(`/unsaved/${encodeURIComponent(key)}`).then(
      (r) => r.json() as Promise<{ key: string; content: string }>,
    ),

  deleteUnsavedScript: (key: string) =>
    apiFetch(`/unsaved/${encodeURIComponent(key)}`, { method: "DELETE" }).then(
      (r) => r.json(),
    ),

  listThreads: () =>
    apiFetch("/threads").then((r) => r.json() as Promise<{ threads: ChatThread[] }>),

  createThread: (scriptKey?: string | null) =>
    apiFetch("/threads", {
      method: "POST",
      body: JSON.stringify({ scriptKey }),
    }).then((r) => r.json() as Promise<{ thread: ChatThread }>),

  getThreadMessages: (id: string) =>
    apiFetch(`/threads/${encodeURIComponent(id)}/messages`).then(
      (r) => r.json() as Promise<{ messages: unknown[] }>,
    ),

  updateThread: (id: string, input: Partial<{ title: string; scriptKey: string | null }>) =>
    apiFetch(`/threads/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((r) => r.json() as Promise<{ thread: ChatThread }>),

  deleteThread: (id: string) =>
    apiFetch(`/threads/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
      (r) => r.json(),
    ),
};
