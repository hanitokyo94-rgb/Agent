import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FileEntry } from "./FileTree";

interface FileModalProps {
  projectId: string;
  files: FileEntry[];
  onRefresh: () => void;
  onClose: () => void;
}

function getLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", html: "html", css: "css", md: "markdown",
    sh: "bash", env: "bash", py: "python", rb: "ruby", go: "go",
    rs: "rust", toml: "toml", yaml: "yaml", yml: "yaml",
  };
  return map[ext] ?? "text";
}

function getFileIcon(filePath: string): string {
  const name = filePath.split("/").pop() ?? filePath;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx"].includes(ext)) return "🔷";
  if (["js", "jsx"].includes(ext)) return "🟡";
  if (["json"].includes(ext)) return "{}";
  if (["css", "scss"].includes(ext)) return "🎨";
  if (["html"].includes(ext)) return "🌐";
  if (["md"].includes(ext)) return "📝";
  if (["py"].includes(ext)) return "🐍";
  if (["sh", "bash"].includes(ext)) return "⚡";
  if (name === ".env" || ext === "env") return "🔐";
  if (name === "package.json") return "📦";
  if (name === "tsconfig.json") return "⚙️";
  return "📄";
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: TreeNode[];
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  const sorted = [...files].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const f of sorted) {
    const parts = f.path.split("/");
    const name = parts[parts.length - 1];
    const node: TreeNode = { name, path: f.path, isDir: f.isDir, size: f.size, children: [] };
    map.set(f.path, node);

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = map.get(parentPath);
      if (parent) parent.children.push(node);
      else root.push(node);
    }
  }

  return root;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function TreeNodeItem({
  node, depth, selectedPath, onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/60 transition-colors text-left"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={cn("shrink-0 text-muted-foreground transition-transform", open ? "rotate-90" : "")}
          >
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-primary/60">
            {open
              ? <><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></>
              : <><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></>
            }
          </svg>
          <span className="text-xs font-medium text-foreground/80 truncate">{node.name}</span>
          {node.children.length > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{node.children.filter(c => !c.isDir).length}</span>
          )}
        </button>
        {open && node.children.map((child) => (
          <TreeNodeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors text-left text-xs",
        selectedPath === node.path
          ? "bg-primary/10 text-primary"
          : "hover:bg-muted/60 text-foreground/70 hover:text-foreground"
      )}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <span className="text-[11px] shrink-0">{getFileIcon(node.name)}</span>
      <span className="truncate font-mono">{node.name}</span>
      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{formatSize(node.size)}</span>
    </button>
  );
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

  const tree = buildTree(files);
  const lang = getLang(selectedPath);
  const isBinary = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(
    selectedPath.split(".").pop()?.toLowerCase() ?? ""
  );
  const lineCount = content.split("\n").length;
  const fileOnlyCount = files.filter((f) => !f.isDir).length;
  const dirCount = files.filter((f) => f.isDir).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-background w-full sm:max-w-5xl h-[92dvh] sm:h-[85vh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary shrink-0">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              <span className="text-sm font-semibold">Project Files</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="bg-muted px-2 py-0.5 rounded-full">{fileOnlyCount} files</span>
              {dirCount > 0 && <span className="bg-muted px-2 py-0.5 rounded-full">{dirCount} dirs</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onRefresh} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="Refresh">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* File tree */}
          <div className="w-52 shrink-0 border-r border-border overflow-y-auto py-2 bg-muted/10">
            {tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-3">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/40 mb-2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p className="text-xs text-muted-foreground">No files yet</p>
              </div>
            ) : (
              <div className="px-1">
                {tree.map((node) => (
                  <TreeNodeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    selectedPath={selectedPath}
                    onSelect={loadFile}
                  />
                ))}
              </div>
            )}
          </div>

          {/* File content */}
          <div className="flex-1 flex flex-col min-w-0 bg-background">
            {!selectedPath ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-20">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <p className="text-sm font-medium mb-1">Select a file</p>
                <p className="text-xs opacity-60">Click a file in the tree to view its content</p>
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
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-muted/5 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{selectedPath}</span>
                    <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground shrink-0">{lang}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{lineCount}L</span>
                    <span className="text-xs text-muted-foreground shrink-0">{content.length}B</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
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

                {/* Content area */}
                {editMode ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 p-4 font-mono text-xs bg-background resize-none outline-none leading-relaxed text-foreground"
                    spellCheck={false}
                  />
                ) : isBinary ? (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <p className="text-muted-foreground text-sm">Binary file — preview not available</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto relative">
                    <div className="flex min-h-full">
                      {/* Line numbers */}
                      <div className="shrink-0 py-4 px-3 text-right select-none bg-muted/20 border-r border-border/30">
                        {content.split("\n").map((_, i) => (
                          <div key={i} className="text-xs font-mono leading-relaxed text-muted-foreground/40 h-[1.5em]">
                            {i + 1}
                          </div>
                        ))}
                      </div>
                      {/* Code */}
                      <pre className="flex-1 p-4 text-xs font-mono leading-relaxed whitespace-pre overflow-x-auto">
                        <code className="text-foreground">{content}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
