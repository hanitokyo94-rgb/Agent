import { useMemo } from "react";
import { renderMarkdown } from "@/lib/utils";

export function MarkdownRenderer({ content, streaming = false }: {
  content: string;
  streaming?: boolean;
}) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div
      className={`prose-ai${streaming ? " streaming-cursor" : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
