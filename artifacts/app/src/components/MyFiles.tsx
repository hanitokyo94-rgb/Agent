import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Attachment {
  name: string;
  type: string;
  url?: string;
  content?: string;
  size?: number;
}

interface MyFilesProps {
  projectId: string;
  onAttach: (files: Attachment[]) => void;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string, name: string): string {
  if (type.startsWith("image/")) return "🖼️";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return "🗜️";
  if (["pdf"].includes(ext)) return "📕";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return "💻";
  if (["json"].includes(ext)) return "{}";
  if (["md"].includes(ext)) return "📝";
  if (["csv", "xlsx", "xls"].includes(ext)) return "📊";
  if (["mp4", "mov", "avi", "webm"].includes(ext)) return "🎬";
  if (["mp3", "wav", "ogg"].includes(ext)) return "🎵";
  return "📄";
}

function fileTypeLabel(type: string, name: string): string {
  if (type.startsWith("image/")) return type.split("/")[1].toUpperCase();
  const ext = name.split(".").pop()?.toUpperCase() ?? "FILE";
  return ext;
}

type Tab = "upload" | "project";

export function MyFiles({ projectId, onAttach, onClose }: MyFilesProps) {
  const [tab, setTab] = useState<Tab>("upload");
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState<Attachment[]>([]);
  const [projectFiles, setProjectFiles] = useState<Attachment[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadProjectFiles() {
    if (projectFiles.length > 0) return;
    setLoadingProject(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const imageFiles = (d.files ?? [])
          .filter((f: any) => !f.isDir)
          .filter((f: any) => {
            const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
            return ["png","jpg","jpeg","gif","webp","svg","pdf","zip","json","md","csv","txt"].includes(ext);
          })
          .map((f: any) => ({
            name: f.path.split("/").pop() ?? f.path,
            type: getTypeFromPath(f.path),
            size: f.size,
          }));
        setProjectFiles(imageFiles);
      }
    } catch {}
    setLoadingProject(false);
  }

  function getTypeFromPath(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const typeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      pdf: "application/pdf", zip: "application/zip",
      json: "application/json", md: "text/markdown",
      csv: "text/csv", txt: "text/plain",
    };
    return typeMap[ext] ?? "application/octet-stream";
  }

  async function processFiles(rawFiles: FileList | File[]) {
    const fileArr = Array.from(rawFiles);
    const newAttachments: Attachment[] = [];

    for (const file of fileArr) {
      const isImage = file.type.startsWith("image/");
      const isText = file.type.startsWith("text/") || ["application/json", "text/markdown", "text/plain", "text/csv"].includes(file.type) || ["json","md","txt","csv","ts","tsx","js","jsx","html","css","yaml","yml","xml","sh","py","rb","go","rs"].includes(file.name.split(".").pop()?.toLowerCase() ?? "");
      // Always read as dataURL — images for vision preview, others for upload to workspace
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      // For small text files also read as text for inline context
      let textContent: string | undefined;
      if (isText && file.size < 200 * 1024) {
        textContent = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsText(file);
        });
      }
      newAttachments.push({ name: file.name, type: file.type, url, content: textContent, size: file.size });
    }
    setStaged((prev) => [...prev, ...newAttachments]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files);
    e.target.value = "";
  }

  function removeStagedFile(i: number) {
    setStaged((prev) => prev.filter((_, j) => j !== i));
  }

  function toggleProjectFile(i: number) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleAttach() {
    const fromStaged = staged;
    const fromProject = [...selectedFiles].map((i) => projectFiles[i]);
    const all = [...fromStaged, ...fromProject];
    if (all.length > 0) onAttach(all);
    else onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-background w-full sm:max-w-lg max-h-[85dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0">
          <div>
            <p className="text-base font-semibold">Attach Files</p>
            <p className="text-xs text-muted-foreground mt-0.5">Images, documents, archives</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-3 border-b border-border shrink-0">
          <button
            onClick={() => setTab("upload")}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
              tab === "upload" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >Upload</button>
          <button
            onClick={() => { setTab("project"); loadProjectFiles(); }}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
              tab === "project" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >Project Files</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "upload" ? (
            <div className="p-5 space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
                  dragging
                    ? "border-primary bg-primary/5 scale-[0.99]"
                    : "border-border/60 hover:border-border hover:bg-muted/30"
                )}
              >
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                  </svg>
                </div>
                <p className="text-sm font-medium">{dragging ? "Drop files here" : "Click to upload or drag & drop"}</p>
                <p className="text-xs text-muted-foreground mt-1">Images, PDF, ZIP, any file type</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                className="hidden"
                onChange={handleFileInput}
              />

              {/* Staged files */}
              {staged.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ready to attach ({staged.length})</p>
                  <div className="space-y-2">
                    {staged.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 border border-border/50 group">
                        {file.url && file.type.startsWith("image/") ? (
                          <img src={file.url} alt={file.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0 text-2xl">
                            {fileIcon(file.type, file.name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {fileTypeLabel(file.type, file.name)}
                            {file.size ? ` · ${formatSize(file.size)}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => removeStagedFile(i)}
                          className="p-1.5 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {staged.length === 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {["🖼️ Photo", "📎 File", "🗜️ Archive"].map((label) => (
                    <button key={label} onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-muted/40 hover:bg-muted/60 border border-border/50 transition-colors">
                      <span className="text-2xl">{label.split(" ")[0]}</span>
                      <span className="text-xs text-muted-foreground">{label.split(" ")[1]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-5">
              {loadingProject ? (
                <div className="flex items-center justify-center py-12">
                  <svg className="animate-spin w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              ) : projectFiles.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-3xl mb-3">📂</p>
                  <p className="text-sm font-medium">No media files yet</p>
                  <p className="text-xs mt-1 opacity-60">Upload files to your project first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : `${projectFiles.length} files`}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {projectFiles.map((file, i) => {
                      const isSelected = selectedFiles.has(i);
                      const isImg = file.type.startsWith("image/");
                      return (
                        <button
                          key={i}
                          onClick={() => toggleProjectFile(i)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-2xl border text-left transition-all",
                            isSelected
                              ? "bg-primary/8 border-primary/30"
                              : "bg-muted/30 border-border/40 hover:bg-muted/50"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl",
                            isSelected ? "bg-primary/10" : "bg-muted"
                          )}>
                            {fileIcon(file.type, file.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{fileTypeLabel(file.type, file.name)}</p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-muted hover:bg-muted/70 text-sm font-medium transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAttach}
              disabled={staged.length === 0 && selectedFiles.size === 0}
              className="flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40"
            >
              {staged.length + selectedFiles.size > 0
                ? `Attach ${staged.length + selectedFiles.size} file${staged.length + selectedFiles.size !== 1 ? "s" : ""}`
                : "Attach"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
