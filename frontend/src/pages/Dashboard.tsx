import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import { Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { api, type ScriptKey } from "@/lib/api";
import { type Attachment, createShelflareAdapter } from "@/lib/chatRuntime";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// --- Message rendering ---

function MarkdownText({ text }: TextMessagePartProps) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const inner = part.slice(3, -3);
          const nl = inner.indexOf("\n");
          const code = nl >= 0 ? inner.slice(nl + 1) : inner;
          return (
            <pre
              key={i}
              className="my-2 rounded-md bg-zinc-900 text-zinc-100 px-4 py-3 font-mono text-sm overflow-x-auto"
            >
              {code}
            </pre>
          );
        }
        return (
          <span key={i} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-4">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start mb-4">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

// --- Main Dashboard ---

export function Dashboard() {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<ScriptKey[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState<string | null>(null);

  // Refs for stable adapter closures (avoid stale captures)
  const attachmentsRef = useRef<Attachment[]>([]);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const loadScripts = useCallback(async () => {
    try {
      const data = await api.listScripts();
      setScripts(data.keys);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    loadRef.current = () => void loadScripts();
  }, [loadScripts]);

  useEffect(() => {
    void loadScripts();
  }, [loadScripts]);

  const adapter = useMemo(
    () =>
      createShelflareAdapter(
        () => attachmentsRef.current,
        () => loadRef.current(),
      ),
    [],
  );

  const runtime = useLocalRuntime(adapter);

  const toggleAttach = async (key: string) => {
    const isAttached = attachments.some((a) => a.key === key);
    if (isAttached) {
      setAttachments((prev) => prev.filter((a) => a.key !== key));
      return;
    }
    setAttaching(key);
    try {
      const { content } = await api.getScript(key);
      setAttachments((prev) => [...prev, { key, content }]);
    } finally {
      setAttaching(null);
    }
  };

  const detachScript = (key: string) => {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  };

  const handleDelete = async (key: string) => {
    await api.deleteScript(key);
    setAttachments((prev) => prev.filter((a) => a.key !== key));
    await loadScripts();
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <header className="border-b h-14 px-4 flex items-center justify-between shrink-0">
          <span className="font-bold tracking-tight">shelflare</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                api.logout();
                navigate("/_dash/login");
              }}
            >
              Logout
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel – script list */}
          <aside className="w-60 border-r flex flex-col shrink-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Scripts
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => navigate("/_dash/new")}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {scripts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8 px-3">
                  No scripts yet.
                </p>
              ) : (
                scripts.map((s) => {
                  const attached = attachments.some((a) => a.key === s.name);
                  const loading = attaching === s.name;
                  return (
                    <div
                      key={s.name}
                      className={cn(
                        "group flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-muted/50 transition-colors select-none",
                        attached && "bg-primary/5",
                      )}
                      onClick={() => void toggleAttach(s.name)}
                    >
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0 transition-colors",
                          attached
                            ? "bg-primary"
                            : "border border-border bg-transparent",
                          loading && "animate-pulse bg-primary/50",
                        )}
                      />
                      <span
                        className={cn(
                          "flex-1 font-mono truncate text-xs",
                          attached && "text-primary font-medium",
                        )}
                      >
                        {s.name}
                      </span>
                      <div
                        className="hidden group-hover:flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          to={`/_dash/edit/${encodeURIComponent(s.name)}`}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon" }),
                            "h-6 w-6",
                          )}
                        >
                          <Pencil className="h-3 w-3" />
                        </Link>
                        <button
                          type="button"
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "icon" }),
                            "h-6 w-6 hover:text-destructive",
                          )}
                          onClick={() => void handleDelete(s.name)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right panel – AI chat */}
          <ThreadPrimitive.Root className="flex flex-col flex-1 overflow-hidden">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-6 py-4">
              <ThreadPrimitive.Empty>
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-24">
                  <p className="text-base font-medium mb-1">AI 脚本助手</p>
                  <p className="text-sm">
                    描述你需要的脚本，或点击左侧脚本附加上下文。
                  </p>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages
                components={{ UserMessage, AssistantMessage }}
              />
            </ThreadPrimitive.Viewport>

            {/* Attachment chips */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-2 pb-1">
                {attachments.map((a) => (
                  <span
                    key={a.key}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-mono border border-primary/20"
                  >
                    {a.key}
                    <button
                      type="button"
                      onClick={() => detachScript(a.key)}
                      className="text-primary/60 hover:text-primary"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Composer */}
            <div className="border-t p-4 shrink-0">
              <ComposerPrimitive.Root className="flex gap-2 items-end">
                <ComposerPrimitive.Input
                  placeholder="描述你需要的脚本，或让 AI 修改已附加的脚本..."
                  rows={1}
                  className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[40px] max-h-[120px] overflow-y-auto"
                />
                <ComposerPrimitive.Send
                  className={cn(buttonVariants({ size: "icon" }), "shrink-0")}
                >
                  <Send className="h-4 w-4" />
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </div>
          </ThreadPrimitive.Root>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
