// ─────────────────────────────────────────────────────────────────────────────
// NovoMarkdown — Production-grade markdown + KaTeX renderer for Novo AI chat
//
// Handles:
//   • Inline math  $...$   and block math  $$...$$
//   • Markdown bold, italic, lists, code blocks, blockquotes, tables
//   • Markdown images ![alt](url) → <img> with lazy loading + error fallback
//   • [DRAW: ...] markers → loading skeleton (resolved to Pollinations URL upstream)
//   • Fenced code blocks with syntax highlighting
// ─────────────────────────────────────────────────────────────────────────────

import ReactMarkdown from 'react-markdown';
import remarkMath    from 'remark-math';
import remarkGfm     from 'remark-gfm';
import rehypeKatex   from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Components } from 'react-markdown';

interface NovoMarkdownProps {
  content:     string;
  isStreaming?: boolean;
  isUser?:     boolean;
}

// Preprocesses content before markdown parsing:
// Replaces [DRAW: ...] with a loading placeholder that survives markdown
function preprocessContent(content: string, isStreaming: boolean): string {
  if (isStreaming) {
    // During streaming: hide [DRAW: ...] markers, show spinner text instead
    return content.replace(/\[DRAW:[^\]]*\]/gi, '_Generating diagram…_');
  }
  // Post-stream: [DRAW:...] should have been resolved to ![img](url) already.
  // Any remaining ones get replaced with an italicised fallback.
  return content.replace(/\[DRAW:[^\]]*\]/gi, '_[diagram unavailable]_');
}

// Sanitise src URLs — only allow known safe image hosts
function isSafeImageUrl(src: string): boolean {
  try {
    const url = new URL(src);
    const safe = [
      'image.pollinations.ai',
      'images.unsplash.com',
      'upload.wikimedia.org',
      'supabase.co',
      'storage.googleapis.com',
    ];
    return safe.some(h => url.hostname.endsWith(h));
  } catch { return false; }
}

export function NovoMarkdown({ content, isStreaming = false, isUser = false }: NovoMarkdownProps) {
  const processed = preprocessContent(content, isStreaming);

  // Plain text for user bubbles — no heavy parsing needed
  if (isUser) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  const components: Components = {
    // ── Images ──────────────────────────────────────────────────────────────
    img({ src, alt }) {
      if (!src) return null;
      if (!isSafeImageUrl(src)) return null;
      return (
        <span style={{ display: 'block', margin: '12px 0' }}>
          <img
            src={src}
            alt={alt ?? 'Educational diagram'}
            loading="lazy"
            style={{
              width: '100%',
              maxWidth: '440px',
              borderRadius: '12px',
              border: '1px solid var(--ink-080)',
              display: 'block',
            }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span style={{ fontSize: '10px', color: 'var(--ink-500)', marginTop: '4px', display: 'block' }}>
            AI-generated diagram
          </span>
        </span>
      );
    },

    // ── Code ────────────────────────────────────────────────────────────────
    code({ className, children, ...props }) {
      const isBlock = className?.startsWith('language-');
      if (isBlock) {
        return (
          <code
            style={{
              display: 'block',
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid var(--ink-060)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              overflowX: 'auto',
              color: 'var(--ink-820)',
              lineHeight: 1.6,
              margin: '8px 0',
              whiteSpace: 'pre',
            }}
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          style={{
            background: 'var(--ink-080)',
            borderRadius: '4px',
            padding: '1px 5px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: '#A5B4FC',
          }}
          {...props}
        >
          {children}
        </code>
      );
    },

    // ── Pre (wraps code blocks) ──────────────────────────────────────────────
    pre({ children }) {
      return <span style={{ display: 'block', margin: '8px 0' }}>{children}</span>;
    },

    // ── Paragraphs ───────────────────────────────────────────────────────────
    p({ children }) {
      return <span style={{ display: 'block', marginBottom: '8px', lineHeight: 1.7 }}>{children}</span>;
    },

    // ── Bold ────────────────────────────────────────────────────────────────
    strong({ children }) {
      return <strong style={{ fontWeight: 600, color: 'var(--ink-950)' }}>{children}</strong>;
    },

    // ── Italic ──────────────────────────────────────────────────────────────
    em({ children }) {
      return <em style={{ color: 'var(--ink-650)', fontStyle: 'italic' }}>{children}</em>;
    },

    // ── Lists ────────────────────────────────────────────────────────────────
    ul({ children }) {
      return (
        <ul style={{ paddingLeft: '18px', margin: '6px 0 10px', listStyleType: 'disc' }}>
          {children}
        </ul>
      );
    },
    ol({ children }) {
      return (
        <ol style={{ paddingLeft: '18px', margin: '6px 0 10px', listStyleType: 'decimal' }}>
          {children}
        </ol>
      );
    },
    li({ children }) {
      return <li style={{ marginBottom: '3px', lineHeight: 1.65 }}>{children}</li>;
    },

    // ── Headings ────────────────────────────────────────────────────────────
    h1({ children }) {
      return <span style={{ display: 'block', fontSize: '15px', fontWeight: 600, margin: '12px 0 6px', color: 'var(--ink-950)' }}>{children}</span>;
    },
    h2({ children }) {
      return <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, margin: '10px 0 5px', color: 'var(--ink-950)' }}>{children}</span>;
    },
    h3({ children }) {
      return <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, margin: '8px 0 4px', color: 'var(--ink-900)' }}>{children}</span>;
    },

    // ── Blockquote ───────────────────────────────────────────────────────────
    blockquote({ children }) {
      return (
        <span
          style={{
            display: 'block',
            borderLeft: '3px solid rgba(91,106,245,0.6)',
            paddingLeft: '12px',
            margin: '8px 0',
            color: 'var(--ink-600)',
            fontStyle: 'italic',
          }}
        >
          {children}
        </span>
      );
    },

    // ── Horizontal rule ──────────────────────────────────────────────────────
    hr() {
      return <hr style={{ border: 'none', borderTop: '1px solid var(--ink-080)', margin: '10px 0' }} />;
    },

    // ── Table ────────────────────────────────────────────────────────────────
    table({ children }) {
      return (
        <span style={{ display: 'block', overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
            {children}
          </table>
        </span>
      );
    },
    th({ children }) {
      return (
        <th style={{ padding: '6px 10px', borderBottom: '1px solid var(--ink-150)', textAlign: 'left', fontWeight: 600, color: 'var(--ink-850)', background: 'var(--ink-050)' }}>
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--ink-060)', color: 'var(--ink-750)' }}>
          {children}
        </td>
      );
    },
  };

  return (
    <span
      style={{
        display: 'block',
        fontSize: '13.5px',
        lineHeight: 1.7,
        color: 'var(--ink-850)',
        // KaTeX overrides
      }}
      className="novo-markdown"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {processed}
      </ReactMarkdown>
    </span>
  );
}
