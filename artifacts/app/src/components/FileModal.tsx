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

function FolderIcon({ open, className }: { open?: boolean; className?: string }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-foreground/50", className)}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-foreground/50", className)}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  );
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (name === "package.json" || name === "package-lock.json") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-red-500", className)}>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    </svg>
  );
  if (name.endsWith(".md")) return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-muted-foreground/70", className)}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
  if (["ts", "tsx"].includes(ext)) return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-blue-500", className)}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 9h6M12 9v6"/>
    </svg>
  );
  if (["js", "jsx", "mjs", "cjs"].includes(ext)) return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-yellow-500", className)}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M10 16v-5h4"/>
    </svg>
  );
  if (ext === "json") return (
    <span className="text-[10px] font-mono font-bold text-white/45 leading-none">{"{}"}</span>
  );
  if (["css", "scss"].includes(ext)) return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-purple-400", className)}>
      <path d="M4 4h16v2.5a8 8 0 01-8 8 8 8 0 01-8-8V4z"/>
    </svg>
  );
  if (ext === "html") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-white/45", className)}>
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  );
  if (ext === "py") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-green-500", className)}>
      <path d="M12 2C8 2 6 4 6 7v2h6v1H5a2 2 0 00-2 2v3c0 3 2 5 6 5h2v-3H9v-1h6v1h-2v3h2c4 0 6-2 6-5v-3a2 2 0 00-2-2h-7V9h6V7c0-3-2-5-6-5z"/>
    </svg>
  );
  if (["env", "sh", "bash"].includes(ext)) return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-emerald-500", className)}>
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  );
  if (name === ".gitignore") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-muted-foreground/60", className)}>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cn("text-muted-foreground/50", className)}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
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

const PACKAGER_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next"]);

function TreeNodeItem({
  node, depth, selectedPath, onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0 && !PACKAGER_DIRS.has(node.name));

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-[6px] hover:bg-[#f0f0f0] dark:hover:bg-muted/40 transition-colors text-left"
          style={{ paddingLeft: `${16 + depth * 16}px` }}
        >
          <FolderIcon open={open} />
          <span className="text-[14px] text-foreground/85 flex-1 truncate">{node.name}</span>
          {!open && node.children.length > 0 && (
            <span className="text-[11px] text-muted-foreground/40 shrink-0">{node.children.filter(c => !c.isDir).length}</span>
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
        "w-full flex items-center gap-2 px-4 py-[6px] transition-colors text-left",
        selectedPath === node.path
          ? "bg-[#e8e8e8] dark:bg-muted"
          : "hover:bg-[#f0f0f0] dark:hover:bg-muted/40"
      )}
      style={{ paddingLeft: `${16 + depth * 16}px` }}
    >
      <span className="shrink-0 flex items-center justify-center w-4"><FileIcon name={node.name} /></span>
      <span className={cn("text-[14px] truncate flex-1", selectedPath === node.path ? "text-foreground font-medium" : "text-foreground/80")}>
        {node.name}
      </span>
    </button>
  );
}

function FileTreePanel({
  tree, selectedPath, onSelect,
}: {
  tree: TreeNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const mainNodes = tree.filter(n => !PACKAGER_DIRS.has(n.name));
  const packagerNodes = tree.filter(n => PACKAGER_DIRS.has(n.name));

  return (
    <div className="h-full overflow-y-auto py-2">
      {mainNodes.length === 0 && packagerNodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/30 mb-3">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p className="text-sm text-muted-foreground/50">No files yet</p>
        </div>
      ) : (
        <>
          {mainNodes.map((node) => (
            <TreeNodeItem key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
          {packagerNodes.length > 0 && (
            <>
              <div className="mx-4 my-2 border-t border-border/40" />
              <p className="text-[11px] text-muted-foreground/40 px-4 py-1">Packager files</p>
              {packagerNodes.map((node) => (
                <TreeNodeItem key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function FileModal({ projectId, files, onRefresh, onClose }: FileModalProps) {
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [mobilePane, setMobilePane] = useState<"tree" | "content">("tree");
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");

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
        setMobilePane("content");
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
    setMobilePane("tree");
    onRefresh();
  }

  const tree = buildTree(files);
  const lang = getLang(selectedPath);
  const isBinary = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(
    selectedPath.split(".").pop()?.toLowerCase() ?? ""
  );
  const lineCount = content ? content.split("\n").length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#f8f8f7] dark:bg-background w-full sm:max-w-5xl h-[92dvh] sm:h-[85vh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-250">
        {/* Mobile handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left: file tree */}
          <div className={cn(
            "shrink-0 flex flex-col bg-[#f8f8f7] dark:bg-background",
            "w-full sm:w-[220px] border-r border-border/40",
            mobilePane === "content" ? "hidden sm:flex" : "flex"
          )}>
            {/* Library header */}
            <div className="flex items-center justify-between px-4 pt-5 pb-3 shrink-0">
              <h2 className="text-[18px] font-semibold text-foreground">Library</h2>
              <button
                onClick={() => setViewMode(v => v === "list" ? "tree" : "list")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                  viewMode === "tree"
                    ? "bg-foreground/8 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="6" y1="12" x2="21" y2="12"/>
                  <line x1="9" y1="18" x2="21" y2="18"/>
                </svg>
                File tree
              </button>
            </div>

            {/* Files */}
            <div className="flex-1 min-h-0">
              <FileTreePanel tree={tree} selectedPath={selectedPath} onSelect={loadFile} />
            </div>

            {/* Bottom actions */}
            <div className="border-t border-border/40 px-3 py-2.5 flex items-center gap-1 shrink-0">
              <ActionButton title="New file" icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>} />
              <ActionButton title="New folder" icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>} />
              <ActionButton title="Upload files" icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} />
              <button
                onClick={onRefresh}
                className="ml-auto p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
                title="Refresh"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                </svg>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Right: file content */}
          <div className={cn(
            "flex-1 flex flex-col min-w-0 bg-background",
            mobilePane === "tree" ? "hidden sm:flex" : "flex"
          )}>
            {!selectedPath ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/20 mb-4">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <p className="text-sm font-medium text-muted-foreground mb-1">No file selected</p>
                <p className="text-xs text-muted-foreground/50">Click a file to view its content</p>
              </div>
            ) : loading ? (
              <div className="flex-1 flex items-center justify-center">
                <svg className="animate-spin w-5 h-5 text-primary/60" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            ) : (
              <>
                {/* File toolbar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-muted/5 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Mobile back */}
                    <button
                      onClick={() => setMobilePane("tree")}
                      className="sm:hidden p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground shrink-0 mr-1"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                    </button>
                    <span className="text-xs font-mono text-muted-foreground truncate">{selectedPath}</span>
                    <span className="hidden sm:inline text-[10px] bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground shrink-0">{lang}</span>
                    {lineCount > 0 && <span className="text-[10px] text-muted-foreground/50 shrink-0">{lineCount}L</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {editMode ? (
                      <>
                        <button onClick={() => { setEditMode(false); setEditContent(content); }} className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
                        <button onClick={saveFile} disabled={saving} className="text-xs px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditMode(true)} className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">Edit</button>
                        <button onClick={() => navigator.clipboard.writeText(content)} className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">Copy</button>
                        <button onClick={deleteFile} className="text-xs px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors">Delete</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Content */}
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
                      <div className="shrink-0 py-4 px-3 text-right select-none bg-muted/15 border-r border-border/30">
                        {content.split("\n").map((_, i) => (
                          <div key={i} className="text-[11px] font-mono leading-relaxed text-muted-foreground/30 h-[1.5em]">
                            {i + 1}
                          </div>
                        ))}
                      </div>
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

function ActionButton({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <button
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      title={title}
    >
      {icon}
      <span className="hidden sm:inline">{title}</span>
    </button>
  );
}
