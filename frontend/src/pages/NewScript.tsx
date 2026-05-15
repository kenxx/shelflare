import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScriptEditor } from "@/components/ScriptEditor";

const DEFAULT_CONTENT = `#!/usr/bin/env bash
set -euo pipefail

echo "Hello from shelflare!"
`;

export function NewScript() {
  const [key, setKey] = useState("");
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

  const handleSave = async () => {
    if (!key.trim()) {
      setError("Script key is required");
      return;
    }
    if (!KEY_RE.test(key.trim())) {
      setError("Key must start with a letter or number, and contain only letters, numbers, hyphens, and underscores");
      return;
    }
    try {
      setSaving(true);
      await api.createScript(key.trim(), content);
      navigate("/_dash");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">New Script</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/_dash")}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 space-y-1.5">
        <Label htmlFor="key">Script Key</Label>
        <Input
          id="key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="e.g. install-app"
          className="font-mono"
        />
        {key && (
          <p className="text-xs text-muted-foreground font-mono">
            curl {window.location.origin}/{key} | sh
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Script Content</Label>
        <ScriptEditor value={content} onChange={setContent} />
      </div>
    </div>
  );
}
