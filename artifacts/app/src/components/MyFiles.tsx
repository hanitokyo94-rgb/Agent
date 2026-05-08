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
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTypeFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    pdf: "application/pdf", zip: "application/zip",
    json: "application/json", md: "text/markdown",
    csv: "text/csv", txt: "text/plain",
    ts: "text/typescript", tsx: "text/typescript",
    js: "text/javascript", jsx: "text/javascript",
    html: "text/html", css: "text/css",
  };
  return map[ext] ?? "application/octet-stream";
}

function FileTypeIcon({ type, name, className = "" }: { type: string; name: string; className?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const isImg = type.startsWith("image/");
  const isPdf = ext === "pdf";
  const isZip = ["zip", "tar", "gz", "rar", "7z"].includes(ext);
  const isCode = ["ts", "tsx", "js", "jsx", "html", "css", "py", "go", "rs", "sh"].includes(ext);
  const isJson = ext === "json";
  const isMd = ext === "md";
  const isCsv = ["csv", "xlsx", "xls"].includes(ext);
  const isVideo = ["mp4", "mov", "avi", "webm"].includes(ext);
  const isAudio = ["mp3", "wav", "ogg"].includes(ext);

  if (isImg) return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
  if (isPdf) return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="11" y2="17"/>
    </svg>
  );
  if (isZip) return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    </svg>
  );
  if (isCode || isJson) return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  );
  if (isMd) return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
    </svg>
  );
  if (isCsv) return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="3" x2="9" y2="21"/>
    </svg>
  );
  if (isVideo) return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="20" height="20" rx="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
    </svg>
  );
  if (isAudio) return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

/** Compress image with canvas if > 800KB, max 1200px, returns data-URL */
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (file.size < 800 * 1024) { resolve(src); return; }
      const img = new Image();
      img.onload = () => {
        const maxPx = 1200;
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          const scale = Math.min(maxPx / width, maxPx / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

type Tab = "upload" | "project";

export function MyFiles({ projectId, onAttach, onClose }: MyFilesProps) {
  const [tab, setTab] = useState<Tab>("upload");
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState<Attachment[]>([]);
  const [projectFiles, setProjectFiles] = useState<{ path: string; size: number }[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authToken = localStorage.getItem("token") ?? "";

  async function loadProjectFiles() {
    if (projectFiles.length > 0) return;
    setLoadingProject(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const d = await res.json();
        const filtered = (d.files ?? [])
          .filter((f: any) => !f.isDir)
          .filter((f: any) => {
            const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
            const ignored = [".github-config", ".secrets", "node_modules", ".git", ".gitignore"];
            if (ignored.some((ig) => f.path.includes(ig))) return false;
            return [
              "png","jpg","jpeg","gif","webp","svg",
              "pdf","zip","json","md","csv","txt",
              "ts","tsx","js","jsx","html","css",
              "mp4","mp3","wav",
            ].includes(ext);
          });
        setProjectFiles(filtered);
      }
    } catch {}
    setLoadingProject(false);
  }

  async function processFiles(rawFiles: FileList | File[]) {
    const arr = Array.from(rawFiles);
    const newAtts: Attachment[] = [];
    for (const file of arr) {
      const isImage = file.type.startsWith("image/");
      const isText = file.type.startsWith("text/") || ["application/json","text/markdown","text/plain","text/csv"].includes(file.type)
        || ["json","md","txt","csv","ts","tsx","js","jsx","html","css","yaml","yml","xml","sh","py","rb","go","rs"].includes(file.name.split(".").pop()?.toLowerCase() ?? "");
      let url: string | undefined;
      let content: string | undefined;
      if (isImage) {
        url = await compressImage(file);
      } else {
        url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      }
      if (isText && file.size < 200 * 1024) {
        content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsText(file);
        });
      }
      newAtts.push({ name: file.name, type: file.type, url, content, size: file.size });
    }
    setStaged((prev) => [...prev, ...newAtts]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) processFiles(e.target.files);
    e.target.value = "";
  }

  function toggleProjectFile(filePath: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
      return next;
    });
  }

  async function openImagePreview(filePath: string) {
    setPreviewPath(filePath);
    const url = `/api/projects/${projectId}/file-raw?path=${encodeURIComponent(filePath)}&token=${authToken}`;
    setPreviewImg(url);
  }

  async function handleAttach() {
    const fromStaged = staged;

    // Load content for selected project files
    const fromProject: Attachment[] = [];
    const paths = [...selectedPaths];
    setLoadingContent(Object.fromEntries(paths.map((p) => [p, true])));

    for (const filePath of paths) {
      const type = getTypeFromPath(filePath);
      const name = filePath.split("/").pop() ?? filePath;
      const isImage = type.startsWith("image/");
      const isText = type.startsWith("text/") || ["application/json"].includes(type);

      try {
        if (isImage) {
          const rawUrl = `/api/projects/${projectId}/file-raw?path=${encodeURIComponent(filePath)}`;
          const imgRes = await fetch(rawUrl, { headers: { Authorization: `Bearer ${authToken}` } });
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.readAsDataURL(blob);
            });
            fromProject.push({ name, type, url: dataUrl, size: blob.size });
          }
        } else if (isText) {
          const res = await fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (res.ok) {
            const d = await res.json();
            const snippet = (d.content ?? "").slice(0, 200_000);
            fromProject.push({ name, type, content: snippet });
          } else {
            fromProject.push({ name, type });
          }
        } else {
          fromProject.push({ name, type });
        }
      } catch {
        fromProject.push({ name, type });
      }
    }

    setLoadingContent({});
    const all = [...fromStaged, ...fromProject];
    if (all.length > 0) onAttach(all);
    else onClose();
  }

  const totalSelected = staged.length + selectedPaths.size;
  const isAttaching = Object.keys(loadingContent).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Image preview overlay */}
      {previewImg && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => { setPreviewImg(null); setPreviewPath(null); }}>
          <div className="relative max-w-3xl max-h-[90dvh] p-2">
            <img src={previewImg} alt={previewPath ?? ""} className="rounded-xl max-w-full max-h-[85dvh] object-contain shadow-2xl" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); if (previewPath) { toggleProjectFile(previewPath); setPreviewImg(null); setPreviewPath(null); setTab("project"); } }}
                className="px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium shadow-lg hover:opacity-90 transition-all"
              >
                {previewPath && selectedPaths.has(previewPath) ? "Deselect" : "Select this image"}
              </button>
              <button onClick={() => { setPreviewImg(null); setPreviewPath(null); }}
                className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur text-white text-sm font-medium shadow-lg hover:bg-white/20 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative bg-background w-full sm:max-w-lg max-h-[88dvh] rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-9 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0">
          <div>
            <p className="text-[15px] font-semibold leading-none">Attach Files</p>
            <p className="text-xs text-muted-foreground mt-1">Images, documents, code files</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-muted transition-colors text-muted-foreground flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 px-5 pb-3 shrink-0 border-b border-border/50">
          <button
            onClick={() => setTab("upload")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all",
              tab === "upload" ? "bg-foreground/8 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Upload
          </button>
          <button
            onClick={() => { setTab("project"); loadProjectFiles(); }}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all",
              tab === "project" ? "bg-foreground/8 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Project Files
            {selectedPaths.size > 0 && (
              <span className="ml-1.5 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold">{selectedPaths.size}</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === "upload" ? (
            <div className="p-5 space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all select-none",
                  dragging
                    ? "border-primary bg-primary/5 scale-[0.99]"
                    : "border-border/50 hover:border-border hover:bg-muted/20"
                )}
              >
                <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground/80">
                  {dragging ? "Drop files here" : "Click or drag & drop"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Images, PDFs, code, archives — any type</p>
              </div>

              <input ref={fileInputRef} type="file" multiple accept="*/*" className="hidden" onChange={handleFileInput} />

              {/* Staged files */}
              {staged.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Ready to attach ({staged.length})
                  </p>
                  <div className="space-y-1.5">
                    {staged.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/40 group">
                        {file.url && file.type.startsWith("image/") ? (
                          <img src={file.url} alt={file.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border/30" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border/30">
                            <FileTypeIcon type={file.type} name={file.name} className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate leading-tight">{file.name}</p>
                          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                            {file.type.split("/")[1]?.toUpperCase() ?? "FILE"}
                            {file.size ? ` · ${formatSize(file.size)}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick type hints */}
              {staged.length === 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Image", sub: "PNG, JPG, WebP", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
                    { label: "Document", sub: "PDF, MD, TXT", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
                    { label: "Archive", sub: "ZIP, TAR", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg> },
                  ].map(({ label, sub, icon }) => (
                    <button key={label} onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 border border-border/40 transition-colors">
                      <span className="text-muted-foreground">{icon}</span>
                      <div className="text-center">
                        <p className="text-[12px] font-medium">{label}</p>
                        <p className="text-[10px] text-muted-foreground">{sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4">
              {loadingProject ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <p className="text-sm">Loading files…</p>
                </div>
              ) : projectFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">No files yet</p>
                    <p className="text-xs mt-1 opacity-60">The agent will create files here when it builds your project</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {selectedPaths.size > 0 ? `${selectedPaths.size} selected` : `${projectFiles.length} files`}
                  </p>

                  {/* Image grid */}
                  {(() => {
                    const imgs = projectFiles.filter((f) => {
                      const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
                      return ["png","jpg","jpeg","gif","webp","svg"].includes(ext);
                    });
                    const others = projectFiles.filter((f) => {
                      const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
                      return !["png","jpg","jpeg","gif","webp","svg"].includes(ext);
                    });
                    return (
                      <>
                        {imgs.length > 0 && (
                          <div>
                            <p className="text-[10.5px] font-medium text-muted-foreground/60 mb-2">Images</p>
                            <div className="grid grid-cols-3 gap-2">
                              {imgs.map((f) => {
                                const isSelected = selectedPaths.has(f.path);
                                const rawUrl = `/api/projects/${projectId}/file-raw?path=${encodeURIComponent(f.path)}`;
                                return (
                                  <div key={f.path} className="relative group aspect-square">
                                    <img
                                      src={`${rawUrl}`}
                                      alt={f.path.split("/").pop()}
                                      className={cn(
                                        "w-full h-full object-cover rounded-xl border-2 transition-all cursor-pointer",
                                        isSelected ? "border-primary opacity-90 scale-[0.97]" : "border-transparent hover:border-border"
                                      )}
                                      onClick={() => openImagePreview(f.path)}
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                    {/* Overlay buttons */}
                                    <div className="absolute inset-0 rounded-xl flex items-end justify-between p-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                                      <div className="bg-black/50 backdrop-blur-sm rounded-lg px-1.5 py-0.5">
                                        <p className="text-[9px] text-white font-medium truncate max-w-[70px]">{f.path.split("/").pop()}</p>
                                      </div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); toggleProjectFile(f.path); }}
                                        className={cn(
                                          "w-6 h-6 rounded-lg flex items-center justify-center transition-all",
                                          isSelected ? "bg-primary" : "bg-black/50 backdrop-blur-sm"
                                        )}
                                      >
                                        {isSelected ? (
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                        ) : (
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                                        )}
                                      </button>
                                    </div>
                                    {/* Selected ring */}
                                    {isSelected && (
                                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md pointer-events-none">
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {others.length > 0 && (
                          <div>
                            {imgs.length > 0 && <p className="text-[10.5px] font-medium text-muted-foreground/60 mb-2 mt-3">Other files</p>}
                            <div className="space-y-1">
                              {others.map((f) => {
                                const isSelected = selectedPaths.has(f.path);
                                const type = getTypeFromPath(f.path);
                                const name = f.path.split("/").pop() ?? f.path;
                                return (
                                  <button
                                    key={f.path}
                                    onClick={() => toggleProjectFile(f.path)}
                                    className={cn(
                                      "flex items-center gap-3 w-full text-left p-2.5 rounded-xl border transition-all",
                                      isSelected
                                        ? "bg-primary/8 border-primary/25"
                                        : "bg-muted/20 border-border/30 hover:bg-muted/40"
                                    )}
                                  >
                                    <div className={cn(
                                      "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border",
                                      isSelected ? "bg-primary/10 border-primary/20" : "bg-muted border-border/30"
                                    )}>
                                      <FileTypeIcon type={type} name={name} className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[12.5px] font-medium truncate leading-tight">{name}</p>
                                      <p className="text-[10.5px] text-muted-foreground leading-tight mt-0.5">
                                        {f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "root"}
                                        {f.size ? ` · ${formatSize(f.size)}` : ""}
                                      </p>
                                    </div>
                                    <div className={cn(
                                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all",
                                      isSelected ? "bg-primary" : "border-2 border-border/50"
                                    )}>
                                      {isSelected && (
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/50 shrink-0 bg-background">
          <div className="flex items-center gap-2.5">
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-muted hover:bg-muted/70 text-[13px] font-medium transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAttach}
              disabled={totalSelected === 0 || isAttaching}
              className="flex-1 py-2.5 rounded-xl bg-foreground text-background text-[13px] font-medium transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isAttaching ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Loading files…
                </>
              ) : totalSelected > 0 ? (
                `Attach ${totalSelected} file${totalSelected !== 1 ? "s" : ""}`
              ) : (
                "Select files above"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
