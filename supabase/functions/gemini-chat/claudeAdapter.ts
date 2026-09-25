// Pure translation layer between the OpenAI-shaped requests/streams that gemini-chat's ReAct
// loop speaks (built for Groq) and Anthropic's Messages API. Extracted from index.ts so it is
// testable without Deno.serve (V5 Day 2: streaming + tool_use translation tests).
// Behaviour is unchanged from the inline versions.

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

// Convert the OpenAI-shaped `messages` array (system message inline, plus
// assistant tool_calls / role:'tool' turns from the ReAct loop) into
// Anthropic's shape: a top-level `system` string and a messages array
// where tool calls are `tool_use` blocks and tool results are `tool_result`
// blocks inside a user-role message.
export function toAnthropicMessages(msgs: unknown[]): { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }> } {
  let system = '';
  const out: Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }> = [];
  const arr = msgs as Array<{
    role?: string; content?: string | null;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
  }>;
  for (const m of arr) {
    if (!m || !m.role) continue;
    if (m.role === 'system') { system += (system ? '\n\n' : '') + (m.content ?? ''); continue; }
    if (m.role === 'user') { out.push({ role: 'user', content: m.content ?? '' }); continue; }
    if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        const blocks: AnthropicContentBlock[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.tool_calls) {
          let input: unknown = {};
          try { input = JSON.parse(tc.function.arguments || '{}'); } catch { /* malformed args -> empty input */ }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
        out.push({ role: 'assistant', content: blocks });
      } else {
        out.push({ role: 'assistant', content: m.content ?? '' });
      }
      continue;
    }
    if (m.role === 'tool') {
      const block: AnthropicContentBlock = { type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: String(m.content ?? '') };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }
  }
  return { system: system || undefined, messages: out };
}

export interface OpenAITool { function: { name: string; description: string; parameters: unknown } }
export function toAnthropicTools(tools: OpenAITool[]): Array<{ name: string; description: string; input_schema: unknown }> {
  return tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
}

// Translate Anthropic's typed SSE event stream into the OpenAI-style
// `data: {"choices":[{"delta":{...},"finish_reason":...}]}` chunks the
// existing drainStreamRound() parser expects, terminated by `data: [DONE]`.
export function anthropicToOpenAIStream(anthropicBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = anthropicBody.getReader();
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            let evt: {
              type?: string; index?: number;
              content_block?: { type?: string; id?: string; name?: string };
              delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
            };
            try { evt = JSON.parse(raw); } catch { continue; }

            if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
              const chunk = { choices: [{ delta: { tool_calls: [{ index: evt.index ?? 0, id: evt.content_block.id, function: { name: evt.content_block.name, arguments: '' } }] }, finish_reason: null }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              const chunk = { choices: [{ delta: { content: evt.delta.text ?? '' }, finish_reason: null }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
              const chunk = { choices: [{ delta: { tool_calls: [{ index: evt.index ?? 0, function: { arguments: evt.delta.partial_json ?? '' } }] }, finish_reason: null }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
              const finish = evt.delta.stop_reason === 'tool_use' ? 'tool_calls' : 'stop';
              const chunk = { choices: [{ delta: {}, finish_reason: finish }] };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } else if (evt.type === 'message_stop') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            }
          }
        }
      } catch { /* client disconnected or upstream closed */ }
      controller.close();
    },
  });
}


/** Convert a non-streaming Anthropic Messages response body into the OpenAI chat-completion shape the ReAct loop parses. */
export function anthropicJsonToOpenAI(anthroJson: {
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason?: string;
}): unknown {
  const blocks = anthroJson.content ?? [];
  const textOut = blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
  const toolUseBlocks = blocks.filter(b => b.type === 'tool_use');
  return {
    choices: [{
      finish_reason: anthroJson.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      message: {
        content: textOut || null,
        tool_calls: toolUseBlocks.length
          ? toolUseBlocks.map(b => ({ id: b.id, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }))
          : undefined,
      },
    }],
  };
}
