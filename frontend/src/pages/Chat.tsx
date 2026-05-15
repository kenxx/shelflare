import { Link } from "react-router-dom";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import { ArrowLeft, Send } from "lucide-react";
import { shelflareAdapter } from "@/lib/chatRuntime";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

function MarkdownText({ text }: TextMessagePartProps) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const inner = part.slice(3, -3);
          const firstNewline = inner.indexOf("\n");
          const code = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner;
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

export function Chat() {
  const runtime = useLocalRuntime(shelflareAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-screen bg-background">
        <header className="border-b h-14 px-4 flex items-center gap-3 shrink-0">
          <Link
            to="/_dash"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="font-semibold">AI 脚本助手</span>
        </header>

        <ThreadPrimitive.Root className="flex flex-col flex-1 overflow-hidden">
          <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4">
            <ThreadPrimitive.Empty>
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-24">
                <p className="text-base font-medium mb-1">AI 脚本助手</p>
                <p className="text-sm">
                  描述你需要的 shell 脚本，我可以帮你写好并直接保存。
                </p>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{ UserMessage, AssistantMessage }}
            />
          </ThreadPrimitive.Viewport>

          <div className="border-t p-4 shrink-0">
            <ComposerPrimitive.Root className="flex gap-2 items-end">
              <ComposerPrimitive.Input
                placeholder='描述你需要的脚本，或说"把上面的脚本保存为 install"...'
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
    </AssistantRuntimeProvider>
  );
}
