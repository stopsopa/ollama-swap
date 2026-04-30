/**
 * $(asdf which node | tr -d '\n') swap.ts $(which ollama | tr -d '\n')
 * DEBUG=1 $(asdf which node | tr -d '\n') swap.ts $(which ollama | tr -d '\n')
 *
 * start:
 * launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.yourname.ollama-swap.plist
 * 
 * inspect:
 * ps aux | grep swap.ts
 * 
 * launchctl print gui/$(id -u)/com.yourname.ollama-swap
 * launchctl print gui/$(id -u)/com.yourname.ollama-swap | grep state
 * 
 * # after extracting pid
 * log show --predicate 'processID == 9098' --last 10m
 * 
 * stop:
 * launchctl bootout gui/$(id -u)/com.yourname.ollama-swap
 * 
 */

import * as http from "http";
import * as https from "https";
import { exec } from "child_process";
import * as util from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = util.promisify(exec);

const DEBUG = process.env.DEBUG === "1";

let currentModel: string | null = null;
let activeRequests = 0;
let pendingSwapModel: string | null = null;

interface QueueItem {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  bodyBuffer: Buffer;
  requestedModel: string | null;
}

const queue: QueueItem[] = [];

const sseClients = new Set<http.ServerResponse>();

const UI_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ollama Proxy Stream</title>
  <style>
    body { margin: 0; padding-top: 60px; font-family: monospace; background: #1e1e1e; color: #d4d4d4; }
    #header { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #252526; display: flex; align-items: center; padding: 0 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.5); z-index: 10; border-bottom: 1px solid #333; }
    button { padding: 8px 16px; cursor: pointer; background: #0e639c; color: white; border: none; border-radius: 4px; font-weight: bold; }
    button:hover { background: #1177bb; }
    pre { padding: 20px; white-space: pre-wrap; word-wrap: break-word; margin: 0; font-size: 14px; line-height: 1.5; }
    .req { color: #569cd6; }
    .res { color: #ce9178; }
    .meta { color: #4ec9b0; font-weight: bold; }
  </style>
</head>
<body>
  <div id="header">
    <button onclick="document.getElementById('out').innerHTML = ''">Reset</button>
  </div>
  <pre id="out"></pre>
  <script>
    const out = document.getElementById('out');
    const evtSource = new EventSource('/_stream');

    function addSystemMessage(msg, color) {
      const span = document.createElement('span');
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const ts = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
      span.textContent = '\\n--- [' + ts + '] ' + msg + ' ---\\n';
      span.style.color = color;
      out.appendChild(span);
      window.scrollTo(0, document.body.scrollHeight);
    }

    // Listen for custom 'system' event sent by server on connection
    evtSource.addEventListener('system', function(event) {
      if (event.data === 'connected') {
        addSystemMessage('Connected', '#4CAF50');
      }
    });
    evtSource.onmessage = function(event) {
      const text = JSON.parse(event.data);
      const lines = text.split('\\n');
      for (const line of lines) {
        const span = document.createElement('span');
        span.textContent = line + '\\n';
        if (line.startsWith('>>>')) {
          span.className = 'req';
        } else if (line.startsWith('<<<')) {
          span.className = 'res';
        } else if (line.trim().length > 0) {
          span.className = 'meta';
        }
        out.appendChild(span);
      }
      window.scrollTo(0, document.body.scrollHeight);
    };
    evtSource.onerror = function() {
      addSystemMessage('Disconnected, trying to reconnect...', '#f44336');
    };
  </script>
</body>
</html>`;

const CONFIG = {
  PORT: process.env.PORT || "11444",
  HOST: process.env.HOST || "0.0.0.0",
  PROXY_PORT: process.env.PROXY_PORT || "11434",
  PROXY_HOST: process.env.PROXY_HOST || "localhost",
  PROXY_SCHEMA: process.env.PROXY_SCHEMA || "http",
  OLLAMA_BIN: process.env.OLLAMA_BIN || process.argv[2] || "ollama",
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Ollama Proxy - Smart swapping proxy for Ollama

Usage:
  OLLAMA_BIN=/usr/local/bin/ollama PORT=11444 node swap.ts

Environment Variables:
  PORT          Port this proxy server runs on (default: 11444)
  HOST          Host this proxy server binds to (default: 0.0.0.0)
  PROXY_PORT    Port of the target Ollama server (default: 11434)
  PROXY_HOST    Host of the target Ollama server (default: localhost)
  PROXY_SCHEMA  Schema for target Ollama server (http or https, default: http)
  OLLAMA_BIN    Path to the ollama CLI tool (default: ollama)
  DEBUG         Set to 1 to enable debug logging

Homepage: https://github.com/stopsopa/ollama-swap
  `);
  process.exit(0);
}

// Validations
if (!/^\d+$/.test(String(CONFIG.PORT))) {
  throw new Error(
    `swap.ts error: Invalid PORT: ${CONFIG.PORT}. Must be digits.`,
  );
}
if (!/^\d+$/.test(String(CONFIG.PROXY_PORT))) {
  throw new Error(
    `swap.ts error: Invalid PROXY_PORT: ${CONFIG.PROXY_PORT}. Must be digits.`,
  );
}
if (!/^https?$/.test(CONFIG.PROXY_SCHEMA)) {
  throw new Error(
    `swap.ts error: Invalid PROXY_SCHEMA: ${CONFIG.PROXY_SCHEMA}. Must be 'http' or 'https'.`,
  );
}

const FAVICON_BASE64 =
  "AAABAAEAMDAQAAEABABoBgAAFgAAACgAAAAwAAAAYAAAAAEABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACAAAAAgIAAgAAAAIAAgACAgAAAgICAAMDAwAAAAP8AAP8AAAD//wD/AAAA/wD/AP//AAD///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////AAD///////8AAP8////8/wAA/z////z/AAD/P////P8AAP8////8/wAA/z////z/AAD/H///+P8AAP8f///4/wAA/x////j/AAD/H///+P8AAP8f///4/wAA/z////z/AAD+P////H8AAP4////8fwAA/j////x/AAD+P////H8AAP4/8A/8fwAA/j/gB/x/AAD/P8/z/P8AAP8fnvn4/wAA/x+eefj/AAD/H555+P8AAP8/n/n8fwAA/jxP8jx/AAD+PGPGPH8AAP48cA48fwAA/j/8P/x/AAD+P////H8AAP4////8fwAA/x////j/AAD/H///+P8AAP+H///h/wAA/8H//4P/AAD/4D/8A/8AAP/gH/gH/wAA/+cP8Of/AAD/54PA5/8AAP/ngADn/wAA/+eAAOf/AAD/5x/45/8AAP/jH/jH/wAA/+M//Ef/AAD/8D/8D/8AAP/wf/4P/wAA//j//x//AAD///////8AAP///////wAA";

function getTimestamp(): string {
  const now = new Date();

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    now.getFullYear() +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate()) +
    " " +
    pad(now.getHours()) +
    ":" +
    pad(now.getMinutes())
  );
}

const log = (...args: unknown[]) => console.log(getTimestamp(), ...args);
const logError = (...args: unknown[]) => console.error(getTimestamp(), ...args);
const debug = (...args: unknown[]) => {
  if (DEBUG) log(...args);
};
const debugError = (...args: unknown[]) => {
  if (DEBUG) logError(...args);
};

function broadcastStream(prefix: string, text: string): void {
  if (sseClients.size === 0 || !text) return;
  const lines = text
    .split("\n")
    .map((l) => `${prefix} ${l}`)
    .join("\n");
  const payload = `data: ${JSON.stringify(lines)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  });
}

function broadcastRaw(text: string): void {
  if (sseClients.size === 0 || !text) return;
  const payload = `data: ${JSON.stringify(text)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  });
}

async function stopModel(model: string | null): Promise<void> {
  if (!model) return;
  const cmd = `${CONFIG.OLLAMA_BIN} stop ${model}`;
  debug(`Executing: ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout && stdout.trim()) debug(`stopModel stdout:\n${stdout.trim()}`);
    if (stderr && stderr.trim())
      debugError(`stopModel stderr:\n${stderr.trim()}`);
  } catch (error: unknown) {
    const err = error as {
      code?: string;
      message: string;
      stdout?: string;
      stderr?: string;
    };
    debugError(
      `stopModel error (code ${err.code || "unknown"}): ${err.message}`,
    );
    if (err.stdout && err.stdout.trim())
      debug(`stopModel error stdout:\n${err.stdout.trim()}`);
    if (err.stderr && err.stderr.trim())
      debugError(`stopModel error stderr:\n${err.stderr.trim()}`);
  }
}

async function performSwap(): Promise<void> {
  log(`Performing swap: ${currentModel} → ${pendingSwapModel}`);
  await stopModel(currentModel);
  currentModel = pendingSwapModel;
  pendingSwapModel = null;
  debug(`Swap complete.`);
}

function forward({
  req,
  res,
  bodyBuffer,
}: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  bodyBuffer: Buffer;
}): void {
  activeRequests++;
  const id = Math.random().toString(36).substring(7);
  debug(
    `[${id}] Forwarding ${req.method} ${req.url} (active: ${activeRequests})`,
  );

  broadcastRaw(`\n${req.method} ${req.url}`);

  if (bodyBuffer && bodyBuffer.length > 0) {
    broadcastStream(">>>", bodyBuffer.toString());
  } else {
    broadcastStream(">>>", `(Empty request body)`);
  }

  // Force uncompressed response so we can read and stream it to the UI
  const headers = { ...req.headers };
  delete headers["accept-encoding"];

  const requester = CONFIG.PROXY_SCHEMA === "https" ? https : http;

  const proxyReq = requester.request(
    {
      hostname: CONFIG.PROXY_HOST,
      port: parseInt(CONFIG.PROXY_PORT, 10),
      path: req.url,
      method: req.method,
      headers: headers,
    },
    (proxyRes) => {
      debug(`[${id}] Response: ${proxyRes.statusCode}`);
      if (proxyRes.statusCode) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
      }
      proxyRes.pipe(res);

      let responseBuffer = "";
      proxyRes.on("data", (chunk) => {
        responseBuffer += chunk.toString();
        let lines = responseBuffer.split("\n");
        const lastLine = lines.pop(); // Keep the incomplete line
        responseBuffer = lastLine !== undefined ? lastLine : "";
        if (lines.length > 0) {
          broadcastStream("<<<", lines.join("\n"));
        }
      });

      proxyRes.on("end", () => {
        if (responseBuffer.length > 0) {
          broadcastStream("<<<", responseBuffer);
        }
      });
    },
  );

  let finished = false;
  const handleFinish = () => onFinish("finish");
  const handleClose = () => onFinish("close");

  const onFinish = async (reason: string) => {
    if (finished) return;
    finished = true;
    activeRequests--;
    debug(`[${id}] Finished (${reason}). Remaining active: ${activeRequests}`);
    res.removeListener("finish", handleFinish);
    res.removeListener("close", handleClose);
    proxyReq.removeListener("error", onError);

    if (pendingSwapModel && activeRequests === 0) {
      await performSwap();
    }
    await processQueue();
  };

  const onError = (err: Error) => {
    debugError(`[${id}] Proxy error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(`Proxy error: ${err.message}`);
    }
    onFinish("error");
  };

  res.on("finish", handleFinish);
  res.on("close", handleClose); // Handle aborted requests
  proxyReq.on("error", onError);

  proxyReq.write(bodyBuffer);
  proxyReq.end();
}

let isProcessingQueue = false;

async function processQueue(): Promise<void> {
  if (isProcessingQueue) {
    debug(`processQueue: Already processing, skipping.`);
    return;
  }
  if (pendingSwapModel) {
    debug(`processQueue: Swap pending (${pendingSwapModel}), skipping.`);
    return;
  }
  isProcessingQueue = true;
  debug(`processQueue: Starting (queue size: ${queue.length})`);

  try {
    while (queue.length > 0) {
      const next = queue[0];
      if (!next) {
        queue.shift();
        continue;
      }
      const { requestedModel } = next;

      // Initialization: first request sets the current model
      if (currentModel === null && requestedModel) {
        currentModel = requestedModel;
        debug(`Initialized currentModel to: ${currentModel}`);
      }

      // Check if swap is needed
      if (requestedModel && currentModel && requestedModel !== currentModel) {
        pendingSwapModel = requestedModel;
        debug(
          `Swap detected: ${currentModel} → ${requestedModel}. Waiting for ${activeRequests} active requests to drain.`,
        );
        if (activeRequests === 0) {
          await performSwap();
          continue;
        }
        return; // Stop processing and keep items in queue
      }

      // No swap needed or not a model-switching request, forward it
      queue.shift();
      forward(next);
    }
  } finally {
    debug(`processQueue: Finished.`);
    isProcessingQueue = false;
  }
}

const server = http.createServer(
  (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.url === "/_stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.flushHeaders();
      sseClients.add(res);

      // Send immediate explicit event to force client-side notification
      res.write(":\n\n");
      res.write("event: system\ndata: connected\n\n");

      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    if (req.url === "/favicon.ico") {
      res.writeHead(200, { "Content-Type": "image/x-icon" });
      res.end(Buffer.from(FAVICON_BASE64, "base64"));
      return;
    }

    if (req.url === "/index.html" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(UI_HTML);
      return;
    }

    let chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => chunks.push(chunk));

    req.on("end", async () => {
      const bodyBuffer = Buffer.concat(chunks);
      const bodyString = bodyBuffer.toString();

      let requestedModel: string | null = null;

      try {
        const json = JSON.parse(bodyString);

        if (json && typeof json.model === "string" && json.model.length > 0) {
          requestedModel = json.model;
        }
      } catch (_) {}

      const isDifferentModel =
        requestedModel && currentModel && requestedModel !== currentModel;

      if (!isDifferentModel && !pendingSwapModel && queue.length === 0) {
        // 🚀 Fast Path: No swap pending, no queue, same model. Forward in parallel.
        if (currentModel === null && requestedModel) {
          currentModel = requestedModel;
        }
        forward({ req, res, bodyBuffer });
      } else {
        // 🐢 Slow Path: Swap needed, or already swapping, or queue has items.
        debug(
          `Enqueuing request for ${requestedModel} (queue size: ${queue.length + 1})`,
        );
        queue.push({ req, res, bodyBuffer, requestedModel });
        await processQueue();
      }
    });
  },
);

server.listen(parseInt(CONFIG.PORT, 10), CONFIG.HOST, () => {
  log(
    `🧠 Concurrent Ollama proxy with smart swapping running on ${CONFIG.HOST}:${CONFIG.PORT}`,
  );
  log(
    `🔗 Target: ${CONFIG.PROXY_SCHEMA}://${CONFIG.PROXY_HOST}:${CONFIG.PROXY_PORT}`,
  );
});
