import type { ChatModelAdapter } from "@assistant-ui/react";

export const shelflareAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const token = localStorage.getItem("token");
    const apiMessages = messages.map((m) => ({
      role: m.role as string,
      content: (m.content as { type: string; text?: string }[])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join(""),
    }));

    const res = await fetch("/_api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages: apiMessages }),
      signal: abortSignal,
    });

    if (!res.ok) throw new Error("Chat API error");

    const reader = (res.body ?? new ReadableStream()).getReader();
    const decoder = new TextDecoder();
    let text = "";
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const delta = (
            JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            }
          ).choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            yield { content: [{ type: "text" as const, text }] };
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  },
};
