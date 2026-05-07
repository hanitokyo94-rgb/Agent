import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { FileEntry } from "./FileTree";
import { FileTree } from "./FileTree";

interface FileModalProps {
  projectId: string;
  files: FileEntry[];
  onRefresh: () => void;
  onClose: () => void;
}

function getLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", html: "html", css: "css", md: "markdown",
    sh: "bash", env: "bash",
  };
  return map[ext] ?? "text";
}

export function FileModal({ projectId, files, onRefresh, onClose }: FileModalProps) {
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");

  async function loadFile(filePath: string) {
    setLoading(true);
    setEditMode(false);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setContent(data.content);
        setEditContent(data.content);
        setSelectedPath(filePath);
      }
    } catch {}
    setLoading(false);
  }

  async function saveFile() {
    setSaving(true);
    const token = localStorage.getItem("token");
    await fetch(`/api/projects/${projectId}/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: selectedPath, content: editContent }),
    });
    setContent(editContent);
    setEditMode(false);
    setSaving(false);
    onRefresh();
  }

  async function deleteFile() {
    if (!confirm(`Delete ${selectedPath}?`)) return;
    const token = localStorage.getItem("token");
    await fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(selectedPath)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setSelectedPath("");
    setContent("");
    onRefresh();
  }

  const lang = getLang(selectedPath);
  const isBinary = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(
    selectedPath.split(".").pop()?.toLowerCase() ?? ""
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* iOS-style modal */}
      <div className="relative bg-background w-full sm:max-w-4xl max-h-[92dvh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Project Files</p>
              {selectedPath && (
                <p className="text-xs text-muted-foreground truncate">{selectedPath}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body: file tree + content */}
        <div className="flex flex-1 min-h-0">
          {/* File tree */}
          <div className="w-48 shrink-0 border-r border-border overflow-y-auto py-2 bg-muted/20">
            <FileTree files={files} onSelect={loadFile} selectedPath={selectedPath} />
          </div>

          {/* File content */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedPath ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p className="text-sm font-medium">Select a file</p>
                <p className="text-xs opacity-60 mt-1">Click a file in the tree to view its content</p>
              </div>
            ) : loading ? (
              <div className="flex-1 flex items-center justify-center">
                <svg className="animate-spin w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            ) : (
              <>
                {/* File toolbar */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/10 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{lang}</span>
                    <span className="text-xs text-muted-foreground">{content.length} chars</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {editMode ? (
                      <>
                        <button
                          onClick={() => { setEditMode(false); setEditContent(content); }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveFile}
                          disabled={saving}
                          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditMode(true)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => navigator.clipboard.writeText(content)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                        >
                          Copy
                        </button>
                        <button
                          onClick={deleteFile}
                          className="text-xs px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Content */}
                {editMode ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 p-4 font-mono text-xs bg-background resize-none outline-none leading-relaxed"
                    spellCheck={false}
                  />
                ) : isBinary ? (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <p className="text-muted-foreground text-sm">Binary file preview not available</p>
                  </div>
                ) : (
                  <pre className="flex-1 overflow-auto p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
                    <code>{content}</code>
                  </pre>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer stats */}
        <div className="px-5 py-2.5 border-t border-border bg-muted/20 shrink-0">
          <p className="text-xs text-muted-foreground">
            {files.filter((f) => !f.isDir).length} files · {files.filter((f) => f.isDir).length} directories
          </p>
        </div>
      </div>
    </div>
  );
}
