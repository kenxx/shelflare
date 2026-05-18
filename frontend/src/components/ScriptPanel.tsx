import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { oneDark } from "@codemirror/theme-one-dark";
import { MergeView } from "@codemirror/merge";
import { Button } from "@/components/ui/button";

interface ScriptPanelProps {
  selected: { key: string; content: string } | null;
  pendingDiff: { old: string; new: string } | null;
  onAccept: () => void;
  onReject: () => Promise<void>;
}

const editorTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-editor": { height: "100%" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "monospace",
    fontSize: "13px",
  },
  // MergeView wraps both editors in .cm-mergeView
  ".cm-mergeView": { height: "100%" },
  ".cm-mergeViewEditors": { height: "100%" },
});

export function ScriptPanel({
  selected,
  pendingDiff,
  onAccept,
  onReject,
}: ScriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !selected) return;

    const sharedExts = [basicSetup, StreamLanguage.define(shell), oneDark, editorTheme];

    if (pendingDiff) {
      const mv = new MergeView({
        a: {
          doc: pendingDiff.old,
          extensions: [...sharedExts, EditorState.readOnly.of(true)],
        },
        b: {
          doc: pendingDiff.new,
          extensions: [...sharedExts, EditorState.readOnly.of(true)],
        },
        parent: containerRef.current,
      });
      return () => mv.destroy();
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: selected.content,
        extensions: [...sharedExts, EditorState.readOnly.of(true)],
      }),
      parent: containerRef.current,
    });
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.key, selected?.content, pendingDiff]);

  if (!selected) {
    return (
      <div className="flex-1 flex items-center justify-center border-r text-sm text-muted-foreground">
        点击左侧脚本查看内容
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden border-r">
      <div className="flex items-center justify-between px-4 h-10 border-b shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{selected.key}</span>
          {pendingDiff && (
            <span className="text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-sm">
              AI 已修改
            </span>
          )}
        </div>
        {pendingDiff && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onAccept}
            >
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
