// Handles: **bold**, *italic*, `code`, # headers, - bullets, 1. numbered lists

export function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let key = 0;

  function flushList() {
    if (!listBuffer.length) return;
    if (listType === 'ul') {
      result.push(
        <ul key={`ul-${key++}`} className="list-none flex flex-col gap-1 my-1">
          {listBuffer.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span>{inlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>,
      );
    } else {
      result.push(
        <ol key={`ol-${key++}`} className="flex flex-col gap-1 my-1 pl-1">
          {listBuffer.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="shrink-0 font-semibold text-primary">{i + 1}.</span>
              <span>{inlineMarkdown(item)}</span>
            </li>
          ))}
        </ol>,
      );
    }
    listBuffer = [];
    listType = null;
  }

  for (const line of lines) {
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    const h1Match = line.match(/^#\s+(.*)/);
    const h2Match = line.match(/^##\s+(.*)/);
    const h3Match = line.match(/^###\s+(.*)/);

    if (ulMatch) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listBuffer.push(ulMatch[1]);
    } else if (olMatch) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listBuffer.push(olMatch[1]);
    } else {
      flushList();
      if (h1Match) {
        result.push(<h2 key={key++} className="font-heading font-bold text-base text-white mt-2 mb-1">{inlineMarkdown(h1Match[1])}</h2>);
      } else if (h2Match) {
        result.push(<h3 key={key++} className="font-heading font-bold text-sm text-white mt-1.5 mb-0.5">{inlineMarkdown(h2Match[1])}</h3>);
      } else if (h3Match) {
        result.push(<p key={key++} className="font-semibold text-sm text-white mt-1">{inlineMarkdown(h3Match[1])}</p>);
      } else if (line.trim() === '') {
        result.push(<div key={key++} className="h-2" />);
      } else {
        result.push(<p key={key++} className="text-sm leading-relaxed">{inlineMarkdown(line)}</p>);
      }
    }
  }
  flushList();
  return result;
}

export function inlineMarkdown(text: string): React.ReactNode {
  // Split on **bold**, *italic*, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i} className="italic">{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="bg-primary/10 text-primary px-1 py-0.5 rounded text-xs font-mono">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
