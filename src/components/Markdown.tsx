"use client";

/**
 * Markdown — renders AI-generated markdown text on-brand (Paper & Ink Bento).
 *
 * Used for assistant output in the AI workspace and content drafts. Styling is
 * scoped to the `.md` class in globals.css (tokens only — no raw hex), covering
 * headings, body, links, lists, tables, blockquotes, and code/pre.
 *
 * GFM (tables, strikethrough, task lists, autolinks) via remark-gfm.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={`md${className ? ` ${className}` : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
