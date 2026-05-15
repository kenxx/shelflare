import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScriptEditor } from "@/components/ScriptEditor";

export function EditScript() {
  const { key } = useParams<{ key: string }>();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!key) return;
    void api
      .getScript(decodeURIComponent(key))
      .then((data) => {
        setContent(data.content);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setLoading(false);
      });
  }, [key]);

  const handleSave = async () => {
    if (!key) return;
    try {
      setSaving(true);
      await api.updateScript(decodeURIComponent(key), content);
      navigate("/_dash");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">
          Edit: <code className="font-mono text-xl">{key ? decodeURIComponent(key) : ""}</code>
        </h1>
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

      <ScriptEditor value={content} onChange={setContent} />
    </div>
  );
}
