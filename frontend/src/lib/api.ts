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

export const api = {
  login: async (username: string, password: string): Promise<void> => {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error: string }).error ?? res.statusText);
    }
    const { token } = (await res.json()) as { token: string };
    localStorage.setItem("token", token);
  },

  logout: (): void => {
    localStorage.removeItem("token");
    fetch(`${BASE}/logout`, { method: "POST" }).catch(() => {});
  },

  me: () => apiFetch("/me").then((r) => r.json() as Promise<{ ok: boolean }>),

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
};
