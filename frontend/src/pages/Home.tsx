import { useState } from "react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative mt-2 group">
      <pre className="rounded-md bg-muted px-4 py-3 font-mono text-sm whitespace-pre-wrap break-all pr-16">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 rounded text-xs bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export function Home() {
  const origin = window.location.origin;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-bold tracking-tight text-lg">shelflare</span>
          <Link
            to="/_dash/login"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4">
          Shell scripts, <span className="text-primary">on demand</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Host and share shell scripts on Cloudflare Workers. One URL to install
          anything — with variable injection baked in.
        </p>
        <div className="flex gap-3 justify-center">
          <Link to="/_dash" className={cn(buttonVariants({ size: "lg" }))}>
            Manage scripts
          </Link>
          <a
            href="https://github.com"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>One-liner install</CardTitle>
              <CardDescription>
                Serve any script over HTTPS. Users pipe it straight into their
                shell.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock>{`curl ${origin}/my-script | sh`}</CodeBlock>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Variable injection</CardTitle>
              <CardDescription>
                Pass querystring params as shell variables — no template editing
                needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock>{`curl "${origin}/install?VERSION=2.1.0" | sh\n# injects: export VERSION='2.1.0'`}</CodeBlock>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GitHub proxy</CardTitle>
              <CardDescription>
                Fetch raw files from GitHub or any HTTPS source through the
                built-in proxy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock>{`curl "${origin}/_proxy/https://raw.githubusercontent.com/…"`}</CodeBlock>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        shelflare — powered by Cloudflare Workers
      </footer>
    </div>
  );
}
