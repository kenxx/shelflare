import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { oneDark } from "@codemirror/theme-one-dark";
import { MergeView } from "@codemirror/merge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEFAULT_CONTENT = `#!/usr/bin/env bash
set -euo pipefail

`;

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export type PanelMode = "view" | "edit" | "new";

interface ScriptPanelProps {
  selected: { key: string; content: string } | null;
  pendingDiff: { old: string; new: string } | null;
  mode: PanelMode;
  onAccept: () => void | Promise<void>;
  onReject: () => Promise<void>;
  onSave: (key: string, content: string) => Promise<void>;
  onCancelEdit: () => void;
  onEnterEdit: () => void;
}

const editorTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-editor": { height: "100%" },
  ".cm-scroller": { overflow: "auto", fontFamily: "monospace", fontSize: "13px" },
  ".cm-mergeView": { height: "100%" },
  ".cm-mergeViewEditors": { height: "100%" },
});

export function ScriptPanel({
  selected,
  pendingDiff,
  mode,
  onAccept,
  onReject,
  onSave,
  onCancelEdit,
  onEnterEdit,
}: ScriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [newKey, setNewKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "new") {
      setNewKey("");
      setKeyError(null);
      setSaveError(null);
    } else if (mode === "edit") {
      setSaveError(null);
    }
  }, [mode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const sharedExts = [basicSetup, StreamLanguage.define(shell), oneDark, editorTheme];

    if (mode === "new") {
      const view = new EditorView({
        state: EditorState.create({ doc: DEFAULT_CONTENT, extensions: sharedExts }),
        parent: containerRef.current,
      });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }

    if (!selected) return;

    if (pendingDiff) {
      const mv = new MergeView({
        a: { doc: pendingDiff.old, extensions: [...sharedExts, EditorState.readOnly.of(true)] },
        b: { doc: pendingDiff.new, extensions: [...sharedExts, EditorState.readOnly.of(true)] },
        parent: containerRef.current,
      });
      return () => mv.destroy();
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: selected.content,
        extensions:
          mode === "edit" ? sharedExts : [...sharedExts, EditorState.readOnly.of(true)],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.key, selected?.content, pendingDiff, mode]);

  const handleSave = async () => {
    const content = viewRef.current?.state.doc.toString() ?? "";
    setSaveError(null);
    setSaving(true);
    try {
      if (mode === "new") {
        const k = newKey.trim();
        if (!k) {
          setKeyError("名称不能为空");
          return;
        }
        if (!KEY_RE.test(k)) {
          setKeyError("只能包含字母、数字、连字符、下划线，且以字母或数字开头");
          return;
        }
        setKeyError(null);
        await onSave(k, content);
      } else if (mode === "edit" && selected) {
        await onSave(selected.key, content);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const topBar = (
    <div className="flex items-center gap-2 px-4 h-10 border-b shrink-0">
      {mode === "new" ? (
        <Input
          value={newKey}
          onChange={(e) => {
            setNewKey(e.target.value);
            setKeyError(null);
          }}
          placeholder="脚本名称（如 install-app）"
          className="h-7 text-sm font-mono w-48"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
          }}
        />
      ) : (
        <span className="font-mono text-sm font-medium">{selected?.key}</span>
      )}
      {keyError && <span className="text-xs text-destructive">{keyError}</span>}
      {saveError && <span className="text-xs text-destructive">{saveError}</span>}
      <div className="flex gap-1.5 ml-auto">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancelEdit}>
          取消
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );

  if (mode === "new") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden border-r">
        {topBar}
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex-1 flex items-center justify-center border-r text-sm text-muted-foreground">
        点击左侧脚本查看内容
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden border-r">
        {topBar}
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      </div>
    );
  }

  // view mode
  return (
    <div className="flex-1 flex flex-col overflow-hidden border-r">
      <div className="flex items-center justify-between px-4 h-10 border-b shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "font-mono text-sm font-medium transition-colors",
              "hover:text-primary cursor-pointer",
            )}
            onClick={onEnterEdit}
            title="点击编辑"
          >
            {selected.key}
          </button>
          {pendingDiff && (
            <span className="text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-sm">
              AI 已修改
            </span>
          )}
        </div>
        {pendingDiff && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void onAccept()}>
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => void onReject()}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
