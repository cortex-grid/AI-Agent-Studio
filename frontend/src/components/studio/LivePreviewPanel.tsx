import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Loader2, Play, RefreshCw, StopCircle } from "lucide-react";
import type { Project } from "@/lib/api";

type WebContainerInstance = import("@webcontainer/api").WebContainer;
type WebContainerProcess = import("@webcontainer/api").WebContainerProcess;

type PreviewStatus = "idle" | "booting" | "installing" | "running" | "stopping" | "error";

interface LivePreviewPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getProject: () => Project;
}

const MAX_LOG_ENTRIES = 200;

const buildServerSource = () => `import express from "express";
import fs from "fs";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

const project = JSON.parse(fs.readFileSync("./project.json", "utf8"));

const countByKind = (kind) =>
  (project?.graph?.nodes || []).filter((node) => node.kind === kind).length;

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    agents: countByKind("agent"),
    tools: countByKind("tool"),
    timestamp: new Date().toISOString(),
    note: "Preview server (mock implementation)",
  });
});

app.post("/api/chat/run", (req, res) => {
  const message = req.body?.message ?? "";
  const agents = countByKind("agent");
  const tools = countByKind("tool");
  res.json({
    text: \`[Preview only] Echo: \${message}

Agents configured: \${agents}
Tools configured: \${tools}\`,
    events: [],
  });
});

app.post("/api/chat/stream", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.write(
    'data: {"type":"notice","data":{"message":"Live streaming is not available in preview mode."}}\\n\\n'
  );
  res.end();
});

app.listen(3000, () => {
  console.log("Preview server listening on http://127.0.0.1:3000");
});`;

export const LivePreviewPanel = ({ open, onOpenChange, getProject }: LivePreviewPanelProps) => {
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState("Hello agents!");
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const containerRef = useRef<WebContainerInstance | null>(null);
  const processRef = useRef<WebContainerProcess | null>(null);
  const isMountedRef = useRef(true);

  const appendLog = useCallback((entry: string) => {
    setLogs((prev) => {
      const merged = [...prev, ...entry.split(/\r?\n/).filter(Boolean)];
      if (merged.length > MAX_LOG_ENTRIES) {
        return merged.slice(-MAX_LOG_ENTRIES);
      }
      return merged;
    });
  }, []);

  const resetState = useCallback(() => {
    setLogs([]);
    setPreviewUrl(null);
    setTestResponse(null);
    setErrorMessage(null);
  }, []);

  const streamOutput = useCallback(
    (stream?: ReadableStream<Uint8Array>) => {
      if (!stream) return;
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const read = async () => {
        try {
          while (isMountedRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) appendLog(decoder.decode(value));
          }
        } catch (err) {
          appendLog(`Stream error: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      read();
    },
    [appendLog]
  );

  const stopPreview = useCallback(async () => {
    if (!containerRef.current) return;
    setStatus((prev) => (prev === "idle" ? "idle" : "stopping"));
    try {
      await processRef.current?.kill();
    } catch {
      // ignore kill errors
    }
    try {
      await containerRef.current.teardown();
    } catch {
      // ignore teardown errors
    }
    containerRef.current = null;
    processRef.current = null;
    setStatus("idle");
    setPreviewUrl(null);
    appendLog("Preview stopped.");
  }, [appendLog]);

  const startPreview = useCallback(async () => {
    if (status === "running" || status === "booting" || status === "installing") return;
    resetState();
    setStatus("booting");
    appendLog("Booting WebContainer...");

    if (!window.isSecureContext) {
      setStatus("error");
      setErrorMessage("Live preview requires a secure (HTTPS) context.");
      appendLog("Error: WebContainers require HTTPS.");
      return;
    }

    try {
      const project = getProject();
      const { WebContainer } = await import("@webcontainer/api");

      const instance = await WebContainer.boot();
      containerRef.current = instance;

      instance.on("server-ready", (port, url) => {
        setPreviewUrl(url);
        appendLog(`Server ready on port ${port} (${url})`);
        setStatus("running");
      });

      const files = {
        "package.json": {
          file: {
            contents: JSON.stringify(
              {
                name: "preview-backend",
                type: "module",
                dependencies: {
                  express: "^4.21.1",
                },
                scripts: {
                  start: "node server.js",
                },
              },
              null,
              2
            ),
          },
        },
        "server.js": {
          file: {
            contents: buildServerSource(),
          },
        },
        "project.json": {
          file: {
            contents: JSON.stringify(project, null, 2),
          },
        },
      } as const;

      await instance.mount(files);
      appendLog("Files mounted.");

      setStatus("installing");
      appendLog("Installing preview dependencies...");
      const installProcess = await instance.spawn("npm", ["install"]);
      streamOutput(installProcess.output);
      const installExit = await installProcess.exit;
      if (installExit !== 0) {
        throw new Error("npm install failed inside preview container.");
      }
      appendLog("Dependencies installed.");

      const startProcess = await instance.spawn("npm", ["run", "start"]);
      processRef.current = startProcess;
      streamOutput(startProcess.output);

      startProcess.exit.then((code) => {
        if (!isMountedRef.current) return;
        if (code !== 0 && status !== "stopping") {
          appendLog(`Preview exited with code ${code}.`);
          setStatus("error");
          setErrorMessage("Preview process exited unexpectedly.");
        } else if (status !== "stopping") {
          setStatus("idle");
          appendLog("Preview process finished.");
        }
      });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`Error: ${message}`);
      setErrorMessage(message);
      setStatus("error");
      await stopPreview();
    }
  }, [appendLog, getProject, resetState, status, stopPreview, streamOutput]);

  const sendTestMessage = useCallback(async () => {
    if (!previewUrl || status !== "running") return;
    setIsTesting(true);
    setTestResponse(null);
    try {
      const response = await fetch(`${previewUrl}/api/chat/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      if (!response.ok) {
        throw new Error(`Preview request failed: ${response.statusText}`);
      }
      const data = await response.json();
      setTestResponse(data.text ?? JSON.stringify(data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTestResponse(`Error: ${message}`);
    } finally {
      setIsTesting(false);
    }
  }, [previewUrl, status, testMessage]);

  const statusBadge = useMemo(() => {
    switch (status) {
      case "idle":
        return <Badge variant="secondary">Idle</Badge>;
      case "booting":
        return <Badge variant="secondary">Booting</Badge>;
      case "installing":
        return <Badge variant="secondary">Installing</Badge>;
      case "running":
        return <Badge className="bg-success text-success-foreground hover:bg-success">Running</Badge>;
      case "stopping":
        return <Badge variant="secondary">Stopping</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return null;
    }
  }, [status]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPreview();
    };
  }, [stopPreview]);

  useEffect(() => {
    if (!open) {
      stopPreview();
    }
  }, [open, stopPreview]);

  const canStart = status === "idle" || status === "error";
  const canStop = status === "running" || status === "booting" || status === "installing";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Live Preview</span>
            {statusBadge}
          </SheetTitle>
          <SheetDescription>
            Launch a sandbox backend running entirely in browser using WebContainers. This provides a mock
            preview of export endpoints without contacting external services.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex gap-2">
            <Button onClick={startPreview} disabled={!canStart} className="gap-2">
              {status === "booting" || status === "installing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {canStart ? "Start preview" : "Starting..."}
            </Button>
            <Button onClick={stopPreview} disabled={!canStop} variant="secondary" className="gap-2">
              <StopCircle className="h-4 w-4" />
              Stop
            </Button>
            <Button
              onClick={() => {
                resetState();
                appendLog("Logs cleared.");
              }}
              variant="ghost"
              size="icon"
              title="Clear logs"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-2">Preview Logs</h4>
            <ScrollArea className="h-40 rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">No logs yet. Start the preview to stream output.</p>
              ) : (
                logs.map((line, index) => (
                  <div key={`${line}-${index}`} className="whitespace-pre-wrap">
                    {line}
                  </div>
                ))
              )}
            </ScrollArea>
          </div>

          {previewUrl && (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Preview server URL</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigator.clipboard.writeText(previewUrl).catch(() => undefined)}
                    title="Copy URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button asChild variant="outline" size="icon" title="Open in new tab">
                    <a href={previewUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
              <code className="block truncate text-xs">{previewUrl}</code>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-2">Test chat request</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Preview mode returns mock responses summarizing your current project configuration.
            </p>
            <div className="space-y-2">
              <Textarea
                value={testMessage}
                onChange={(event) => setTestMessage(event.target.value)}
                rows={3}
              />
              <Button
                onClick={sendTestMessage}
                disabled={!previewUrl || status !== "running" || isTesting}
                className="gap-2"
              >
                {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Send to preview
              </Button>
              {testResponse && (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap">
                  {testResponse}
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
