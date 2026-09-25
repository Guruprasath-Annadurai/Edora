/**
 * Edora Chaos & Failure Injection Mock Server
 * Simulates third-party provider failures, timeouts, network latency,
 * and database error codes without impacting real external services.
 */

import http from 'http';
import url from 'url';

const PORT = process.env.CHAOS_PORT || 9099;

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const chaosMode = req.headers['x-chaos-mode'] || parsedUrl.searchParams.get('chaos') || 'normal';

  // Enable CORS for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle specific chaos scenarios
  switch (chaosMode) {
    case 'groq-500':
      res.writeHead(500);
      res.end(JSON.stringify({ error: { message: 'Internal Server Error: Groq compute unit exhausted' } }));
      break;

    case 'groq-timeout':
    case 'slow-api':
      // Delay response by 3500ms to trigger client-side AbortController timeout
      setTimeout(() => {
        res.writeHead(200);
        res.end(JSON.stringify({ choices: [{ message: { content: 'Delayed response after timeout window' } }] }));
      }, 3500);
      break;

    case 'claude-fail':
      res.writeHead(529); // Anthropic Overloaded
      res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Anthropic capacity saturated' } }));
      break;

    case 'gemini-fail':
      res.writeHead(429); // Resource Exhausted
      res.end(JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).' } }));
      break;

    case 'all-fail':
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'All upstream model providers unreachable' }));
      break;

    case 'db-timeout':
      res.writeHead(504);
      res.end(JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }));
      break;

    case 'duplicate-idempotency': {
      const idempotencyKey = req.headers['idempotency-key'] || 'none';
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'accepted',
        idempotencyKey,
        replayed: idempotencyKey !== 'none',
        message: 'Action recorded idempotently',
      }));
      break;
    }

    default:
      // Normal healthy response
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'healthy',
        provider: 'mock-primary',
        content: 'Normal tutor response for Newton third law',
      }));
  }
});

server.listen(PORT, () => {
  console.log(`Chaos Mock Server listening on port ${PORT}`);
});

export default server;
