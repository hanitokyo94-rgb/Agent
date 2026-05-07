import { useState } from "react";
import { cn } from "@/lib/utils";

export interface FileEntry {
  path: string;
  size: number;
  isDir: boolean;
}

interface FileTreeProps {
  files: FileEntry[];
  onSelect: (path: string) => void;
  selectedPath?: string;
}

function buildTree(files: FileEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [], size: 0 };
  for (const f of files) {
    const parts = f.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partPath = parts.slice(0, i + 1).join("/");
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          path: partPath,
          isDir: i < parts.length - 1 || f.isDir,
          children: [],
          size: f.size,
        };
        current.children.push(child);
      }
      current = child;
    }
  }
  return root;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  size: number;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx"].includes(ext)) return "🔷";
  if (["js", "jsx"].includes(ext)) return "🟡";
  if (["json"].includes(ext)) return "📋";
  if (["html"].includes(ext)) return "🌐";
  if (["css", "scss"].includes(ext)) return "🎨";
  if (["md"].includes(ext)) return "📝";
  if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) return "🖼️";
  if (name === "package.json") return "📦";
  if (name === ".env" || name === ".secrets.json") return "🔐";
  return "📄";
}

function TreeNodeItem({
  node,
  depth,
  onSelect,
  selectedPath,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
  selectedPath?: string;
}) {
  const [expanded, setExpanded] = useState(depth === 0 || depth === 1);

  if (node.name === "") {
    return (
      <div>
        {node.children.map((c) => (
          <TreeNodeItem key={c.path} node={c} depth={depth} onSelect={onSelect} selectedPath={selectedPath} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => {
          if (node.isDir) setExpanded(!expanded);
          else onSelect(node.path);
        }}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left transition-colors hover:bg-muted",
          selectedPath === node.path && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.isDir ? (
          <>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={cn("shrink-0 transition-transform text-muted-foreground", expanded && "rotate-90")}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span className="shrink-0">📁</span>
          </>
        ) : (
          <span className="shrink-0 ml-3.5">{fileIcon(node.name)}</span>
        )}
        <span className="truncate">{node.name}</span>
        {!node.isDir && (
          <span className="ml-auto text-muted-foreground shrink-0">
            {node.size > 1024 ? `${(node.size / 1024).toFixed(1)}k` : `${node.size}B`}
          </span>
        )}
      </button>
      {node.isDir && expanded && (
        <div>
          {node.children.map((c) => (
            <TreeNodeItem key={c.path} node={c} depth={depth + 1} onSelect={onSelect} selectedPath={selectedPath} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ files, onSelect, selectedPath }: FileTreeProps) {
  const tree = buildTree(files);
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
        <p>📂 No files yet</p>
        <p className="mt-1 opacity-60">The agent will create files here</p>
      </div>
    );
  }
  return <TreeNodeItem node={tree} depth={0} onSelect={onSelect} selectedPath={selectedPath} />;
}
