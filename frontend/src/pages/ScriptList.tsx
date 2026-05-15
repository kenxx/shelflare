import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type ScriptKey } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export function ScriptList() {
  const [scripts, setScripts] = useState<ScriptKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.listScripts();
      setScripts(data.keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scripts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (key: string) => {
    await api.deleteScript(key);
    await load();
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Shell Scripts</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                api.logout();
                navigate("/_dash/login");
              }}
            >
              Logout
            </Button>
            <Button onClick={() => navigate("/_dash/new")}>New Script</Button>
          </div>
      </div>

      {scripts.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">No scripts yet. Create one!</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {scripts.map((s) => (
            <div key={s.name} className="flex items-center justify-between p-4 hover:bg-muted/30">
              <div className="flex flex-col gap-1">
                <span className="font-mono font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  curl {window.location.origin}/{s.name} | sh
                </span>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/_dash/edit/${encodeURIComponent(s.name)}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Edit
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger>
                    <span className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}>
                      Delete
                    </span>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete &quot;{s.name}&quot;?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleDelete(s.name)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
