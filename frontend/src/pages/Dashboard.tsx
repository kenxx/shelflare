import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { UIMessage } from "ai";
import { useNavigate } from "react-router-dom";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { ArrowUp, Check, Pencil, Plus, Trash2, Users } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type ChatThread, type CurrentUser, type ScriptKey, type UserRecord } from "@/lib/api";
import { type PanelMode, ScriptPanel } from "@/components/ScriptPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ScriptContext = { key: string; content: string };

function MarkdownText({ text }: TextMessagePartProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        code: ({ className, children, ...props }) => {
          const isBlock = className?.startsWith("language-");
          return isBlock ? (
            <pre className="my-2 rounded-md bg-zinc-900 text-zinc-100 px-4 py-3 font-mono text-sm overflow-x-auto">
              <code>{children}</code>
            </pre>
          ) : (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-80">
            {children}
          </a>
        ),
        h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-1 mb-0.5">{children}</h3>,
      }}
    >
      {text}
    </ReactMarkdown>
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

function LoadingDots() {
  return (
    <div className="mt-2 flex gap-1 items-center">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start mb-4">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
        <MessagePrimitive.If last>
          <ThreadPrimitive.If running>
            <LoadingDots />
          </ThreadPrimitive.If>
        </MessagePrimitive.If>
      </div>
    </MessagePrimitive.Root>
  );
}

const DEFAULT_CHAT_WIDTH = 384;
const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 720;

type ChatResizeDrag = {
  pointerId: number;
  startWidth: number;
  startX: number;
} | null;

function clampChatWidth(width: number) {
  const viewportMax =
    typeof window === "undefined" ? MAX_CHAT_WIDTH : Math.max(MIN_CHAT_WIDTH, window.innerWidth - 520);
  return Math.min(Math.max(width, MIN_CHAT_WIDTH), Math.min(MAX_CHAT_WIDTH, viewportMax));
}

function ChatPane({
  selected,
  threadId,
  initialMessages,
  onRunComplete,
}: {
  selected: ScriptContext | null;
  threadId: string;
  initialMessages: UIMessage[];
  onRunComplete: (contextBefore: ScriptContext | null) => Promise<void>;
}) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/_api/chat",
        body: { context: selected, threadId },
        headers: () => {
          const token = localStorage.getItem("token");
          return token ? { Authorization: `Bearer ${token}` } : new Headers();
        },
      }),
    [selected, threadId],
  );

  const runtime = useChatRuntime({
    messages: initialMessages,
    transport,
    onFinish: ({ isAbort, isError }) => {
      if (!isAbort && !isError) void onRunComplete(selected);
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4">
          <ThreadPrimitive.Empty>
            <div className="flex h-full flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <p className="mb-1 text-sm font-medium">AI 脚本助手</p>
              <p className="text-xs">直接描述你需要的脚本，AI 帮你创建。</p>
              <p className="mt-1 text-xs">或先选中左侧脚本，再让 AI 修改。</p>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ThreadPrimitive.Viewport>

        <div className="border-t p-3 shrink-0">
          <ComposerPrimitive.Root className="flex w-full flex-col rounded-3xl border bg-muted">
            <ComposerPrimitive.Input
              placeholder={
                selected
                  ? `跟 AI 聊关于 "${selected.key}" 的修改...`
                  : "描述你需要的脚本，AI 可以帮你创建并保存..."
              }
              rows={1}
              className="min-h-10 w-full resize-none bg-transparent px-5 pt-4 pb-3 text-sm placeholder:text-muted-foreground focus:outline-none"
            />
            <div className="flex items-center justify-end px-3 pb-3">
              <ComposerPrimitive.Send className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
                <ArrowUp className="size-4" />
              </ComposerPrimitive.Send>
            </div>
          </ComposerPrimitive.Root>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function UsersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CurrentUser["role"]>("user");
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const data = await api.listUsers();
    setUsers(data.users);
  }, []);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      void loadUsers().catch((err) => setError(err instanceof Error ? err.message : "加载用户失败"));
    });
  }, [loadUsers, open]);

  const createUser = async () => {
    try {
      setError(null);
      await api.createUser({ username, password, role });
      setUsername("");
      setPassword("");
      setRole("user");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建用户失败");
    }
  };

  const updateUser = async (
    id: string,
    input: Partial<{ role: CurrentUser["role"]; disabled: boolean; password: string }>,
  ) => {
    try {
      setError(null);
      await api.updateUser(id, input);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新用户失败");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-xs">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background ring-1 ring-border">
        <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <h2 className="text-sm font-semibold">用户管理</h2>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="初始密码"
            type="password"
          />
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as CurrentUser["role"])}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <Button size="sm" onClick={() => void createUser()}>
            创建
          </Button>
          {error && <p className="text-xs text-destructive sm:col-span-4">{error}</p>}
        </div>
        <div className="overflow-y-auto p-2">
          {users.map((user) => (
            <div key={user.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50">
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-medium", user.disabledAt && "text-muted-foreground")}>
                  {user.username}
                </p>
                <p className="text-xs text-muted-foreground">{user.role}{user.disabledAt ? " · disabled" : ""}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void updateUser(user.id, { role: user.role === "admin" ? "user" : "admin" })}
              >
                {user.role === "admin" ? "设为 user" : "设为 admin"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = window.prompt(`重置 ${user.username} 的密码`);
                  if (next) void updateUser(user.id, { password: next });
                }}
              >
                重置密码
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(user.disabledAt ? "text-foreground" : "text-destructive hover:text-destructive")}
                onClick={() => void updateUser(user.id, { disabled: !user.disabledAt })}
              >
                {user.disabledAt ? "启用" : "禁用"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [scripts, setScripts] = useState<ScriptKey[]>([]);
  const [selected, setSelected] = useState<ScriptContext | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [pendingDiff, setPendingDiff] = useState<{ old: string; new: string } | null>(null);
  const [mode, setMode] = useState<PanelMode>("view");
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [chatResizeDrag, setChatResizeDrag] = useState<ChatResizeDrag>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<UIMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const initializedRef = useRef(false);

  const loadScripts = useCallback(async () => {
    const data = await api.listScripts();
    setScripts(data.keys);
  }, []);

  const loadThreads = useCallback(async () => {
    const data = await api.listThreads();
    setThreads(data.threads);
    return data.threads;
  }, []);

  const openThread = useCallback(async (threadId: string) => {
    setLoadingThread(true);
    try {
      const data = await api.getThreadMessages(threadId);
      setSelectedThreadId(threadId);
      setThreadMessages(data.messages as UIMessage[]);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const createThread = useCallback(async (scriptKey?: string | null) => {
    const { thread } = await api.createThread(scriptKey);
    await loadThreads();
    await openThread(thread.id);
  }, [loadThreads, openThread]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    queueMicrotask(() => {
      void Promise.all([api.me(), loadScripts(), loadThreads()]).then(async ([me, , loadedThreads]) => {
        setCurrentUser(me.user);
        if (loadedThreads[0]) {
          await openThread(loadedThreads[0].id);
        } else {
          await createThread(null);
        }
      });
    });
  }, [createThread, loadScripts, loadThreads, openThread]);

  const onComplete = useCallback(
    async (contextBefore: ScriptContext | null) => {
      await Promise.all([loadScripts(), loadThreads()]);
      if (!contextBefore) return;
      try {
        const { content: unsavedContent } = await api.getUnsavedScript(contextBefore.key);
        if (selected?.key === contextBefore.key) {
          setPendingDiff({ old: contextBefore.content, new: unsavedContent });
        }
      } catch {
        // 404 = AI 没有存草稿（如新建脚本），无需 diff
      }
    },
    [loadScripts, loadThreads, selected],
  );

  const selectScript = async (key: string) => {
    if (mode !== "view") {
      setMode("view");
      setPendingDiff(null);
      if (selected?.key === key) return;
    } else if (selected?.key === key) {
      setSelected(null);
      setPendingDiff(null);
      return;
    }
    setSelecting(key);
    setPendingDiff(null);
    try {
      const { content } = await api.getScript(key);
      setSelected({ key, content });
      try {
        const { content: unsavedContent } = await api.getUnsavedScript(key);
        setPendingDiff({ old: content, new: unsavedContent });
      } catch {
        // 404 = no draft for this script
      }
    } finally {
      setSelecting(null);
    }
  };

  const handleEnterEdit = async (key: string) => {
    if (selected?.key !== key) {
      setSelecting(key);
      try {
        const { content } = await api.getScript(key);
        setSelected({ key, content });
      } finally {
        setSelecting(null);
      }
    }
    setPendingDiff(null);
    setMode("edit");
  };

  const enterNewMode = () => {
    setSelected(null);
    setPendingDiff(null);
    setMode("new");
  };

  const handleSave = async (key: string, content: string) => {
    if (mode === "new") {
      await api.createScript(key, content);
      await loadScripts();
      setSelected({ key, content });
    } else if (selected) {
      if (key !== selected.key) {
        await api.createScript(key, content);
        await api.deleteScript(selected.key);
        await loadScripts();
        setSelected({ key, content });
      } else {
        await api.updateScript(key, content);
        setSelected({ key, content });
      }
    }
    setMode("view");
  };

  const handleDelete = async (key: string) => {
    if (mode !== "view" && selected?.key === key) setMode("view");
    await api.deleteScript(key);
    if (selected?.key === key) {
      setSelected(null);
      setPendingDiff(null);
    }
    await loadScripts();
  };

  const handleAccept = async () => {
    if (!selected || !pendingDiff) return;
    await api.updateScript(selected.key, pendingDiff.new);
    await api.deleteUnsavedScript(selected.key);
    setSelected({ key: selected.key, content: pendingDiff.new });
    setPendingDiff(null);
  };

  const handleReject = async () => {
    if (!selected || !pendingDiff) return;
    await api.deleteUnsavedScript(selected.key);
    setPendingDiff(null);
  };

  const deleteActiveThread = async () => {
    if (!selectedThreadId) return;
    await api.deleteThread(selectedThreadId);
    const remaining = await loadThreads();
    if (remaining[0]) {
      await openThread(remaining[0].id);
    } else {
      await createThread(selected?.key ?? null);
    }
  };

  const startChatResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setChatResizeDrag({
        pointerId: event.pointerId,
        startWidth: chatWidth,
        startX: event.clientX,
      });
    },
    [chatWidth],
  );

  const resizeChat = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!chatResizeDrag || chatResizeDrag.pointerId !== event.pointerId) return;
      setChatWidth(clampChatWidth(chatResizeDrag.startWidth + chatResizeDrag.startX - event.clientX));
    },
    [chatResizeDrag],
  );

  const stopChatResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    setChatResizeDrag((drag) => {
      if (!drag || drag.pointerId !== event.pointerId) return drag;
      return null;
    });
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-bold tracking-tight">shelflare</span>
        <div className="flex items-center gap-1.5">
          {currentUser?.role === "admin" && (
            <Button variant="ghost" size="sm" onClick={() => setUsersOpen(true)}>
              <Users className="size-3.5" />
              Users
            </Button>
          )}
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
        </div>
      </header>

      <UsersDialog open={usersOpen} onOpenChange={setUsersOpen} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-52 shrink-0 flex-col overflow-hidden border-r">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scripts</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={enterNewMode}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {scripts.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">No scripts yet.</p>
            ) : (
              scripts.map((s) => {
                const isSelected = selected?.key === s.name;
                const loading = selecting === s.name;
                return (
                  <div
                    key={s.name}
                    className={cn(
                      "group flex h-8 cursor-pointer select-none items-center gap-2 px-3 transition-colors hover:bg-muted/50",
                      isSelected && "bg-primary/5",
                    )}
                    onClick={() => void selectScript(s.name)}
                  >
                    <div
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full transition-colors",
                        isSelected ? "bg-primary" : "border border-border bg-transparent",
                        loading && "animate-pulse bg-primary/50",
                      )}
                    />
                    <span className={cn("flex-1 truncate font-mono text-xs", isSelected && "font-medium text-primary")}>
                      {s.name}
                    </span>
                    <div className="hidden items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-6 w-6")}
                        onClick={() => void handleEnterEdit(s.name)}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-6 w-6 hover:text-destructive")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </AlertDialogTrigger>
                        <AlertDialogContent size="sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除脚本</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要删除 <span className="font-mono font-medium text-foreground">{s.name}</span> 吗？此操作无法撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => void handleDelete(s.name)}>
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <ScriptPanel
          selected={selected}
          pendingDiff={pendingDiff}
          mode={mode}
          onAccept={handleAccept}
          onReject={handleReject}
          onSave={handleSave}
          onCancelEdit={() => setMode("view")}
          onEnterEdit={() => setMode("edit")}
        />

        <div
          className={cn("relative flex shrink-0 flex-col overflow-hidden", chatResizeDrag && "select-none")}
          style={{ width: chatWidth }}
        >
          <div
            aria-label="Resize AI chat panel"
            aria-orientation="vertical"
            aria-valuemax={MAX_CHAT_WIDTH}
            aria-valuemin={MIN_CHAT_WIDTH}
            aria-valuenow={Math.round(chatWidth)}
            className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none border-l border-transparent transition-colors hover:border-primary/40 active:border-primary"
            role="separator"
            tabIndex={0}
            onPointerDown={startChatResize}
            onPointerMove={resizeChat}
            onPointerUp={stopChatResize}
            onPointerCancel={stopChatResize}
          />

          <div className="flex h-10 shrink-0 items-center gap-1 border-b px-3 pl-4">
            <span className="flex-1 truncate text-xs font-medium text-muted-foreground">
              {threads.find((thread) => thread.id === selectedThreadId)?.title ?? "AI chat"}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void createThread(selected?.key ?? null)}>
              <Plus className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => void deleteActiveThread()}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <div className="max-h-32 shrink-0 overflow-y-auto border-b py-1">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs hover:bg-muted/50",
                  selectedThreadId === thread.id && "bg-muted text-foreground",
                )}
                onClick={() => void openThread(thread.id)}
              >
                <span className="flex-1 truncate">{thread.title}</span>
                {thread.scriptKey && <span className="truncate font-mono text-muted-foreground">{thread.scriptKey}</span>}
                {selectedThreadId === thread.id && <Check className="size-3 shrink-0" />}
              </button>
            ))}
          </div>

          {selectedThreadId && !loadingThread ? (
            <ChatPane
              key={selectedThreadId}
              selected={selected}
              threadId={selectedThreadId}
              initialMessages={threadMessages}
              onRunComplete={onComplete}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading...</div>
          )}
        </div>
      </div>
    </div>
  );
}
