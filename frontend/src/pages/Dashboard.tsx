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
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { api, type ScriptKey } from "@/lib/api";
import { type ScriptContext, createShelflareAdapter } from "@/lib/chatRuntime";
import { ScriptPanel } from "@/components/ScriptPanel";
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
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start mb-4">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

// --- Main Dashboard ---

export function Dashboard() {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<ScriptKey[]>([]);
  const [selected, setSelected] = useState<ScriptContext | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [pendingDiff, setPendingDiff] = useState<{
    old: string;
    new: string;
  } | null>(null);

  // Stable refs for adapter closures
  const selectedRef = useRef<ScriptContext | null>(null);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

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

  const onComplete = useCallback(
    async (contextBefore: ScriptContext | null) => {
      void loadScripts();
      if (!contextBefore) return;
      try {
        const { content: newContent } = await api.getScript(contextBefore.key);
        if (
          newContent !== contextBefore.content &&
          selectedRef.current?.key === contextBefore.key
        ) {
          setPendingDiff({ old: contextBefore.content, new: newContent });
          setSelected({ key: contextBefore.key, content: newContent });
        }
      } catch {
        // ignore fetch errors
      }
    },
    [loadScripts],
  );

  const adapter = useMemo(
    () => createShelflareAdapter(() => selectedRef.current, onComplete),
    [onComplete],
  );

  const runtime = useLocalRuntime(adapter);

  const selectScript = async (key: string) => {
    if (selected?.key === key) {
      setSelected(null);
      setPendingDiff(null);
      return;
    }
    setSelecting(key);
    setPendingDiff(null);
    try {
      const { content } = await api.getScript(key);
      setSelected({ key, content });
    } finally {
      setSelecting(null);
    }
  };

  const handleDelete = async (key: string) => {
    await api.deleteScript(key);
    if (selected?.key === key) {
      setSelected(null);
      setPendingDiff(null);
    }
    await loadScripts();
  };

  const handleAccept = () => setPendingDiff(null);

  const handleReject = async () => {
    if (!selected || !pendingDiff) return;
    await api.updateScript(selected.key, pendingDiff.old);
    setSelected({ key: selected.key, content: pendingDiff.old });
    setPendingDiff(null);
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <header className="border-b h-12 px-4 flex items-center justify-between shrink-0">
          <span className="font-bold tracking-tight text-sm">shelflare</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              api.logout();
              navigate("/_dash/login");
            }}
          >
            Logout
          </Button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: script list */}
          <aside className="w-52 border-r flex flex-col shrink-0 overflow-hidden">
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
                  const isSelected = selected?.key === s.name;
                  const loading = selecting === s.name;
                  return (
                    <div
                      key={s.name}
                      className={cn(
                        "group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors select-none",
                        isSelected && "bg-primary/5",
                      )}
                      onClick={() => void selectScript(s.name)}
                    >
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0 transition-colors",
                          isSelected
                            ? "bg-primary"
                            : "border border-border bg-transparent",
                          loading && "animate-pulse bg-primary/50",
                        )}
                      />
                      <span
                        className={cn(
                          "flex-1 font-mono truncate text-xs",
                          isSelected && "text-primary font-medium",
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

          {/* Middle: script content / diff */}
          <ScriptPanel
            selected={selected}
            pendingDiff={pendingDiff}
            onAccept={handleAccept}
            onReject={handleReject}
          />

          {/* Right: AI chat */}
          <ThreadPrimitive.Root className="w-96 shrink-0 flex flex-col overflow-hidden">
            <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4">
              <ThreadPrimitive.Empty>
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-16">
                  <p className="text-sm font-medium mb-1">AI 脚本助手</p>
                  <p className="text-xs">
                    选中左侧脚本开始对话，或描述需要创建的脚本。
                  </p>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages
                components={{ UserMessage, AssistantMessage }}
              />
            </ThreadPrimitive.Viewport>

            <div className="border-t p-3 shrink-0">
              <ComposerPrimitive.Root className="flex gap-2 items-end">
                <ComposerPrimitive.Input
                  placeholder={
                    selected
                      ? `跟 AI 聊关于 "${selected.key}" 的修改...`
                      : "描述你需要的脚本，AI 可以帮你创建并保存..."
                  }
                  rows={1}
                  className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[38px] max-h-[100px] overflow-y-auto"
                />
                <ComposerPrimitive.Send
                  className={cn(buttonVariants({ size: "icon" }), "shrink-0 h-9 w-9")}
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
