/**
 * API client for backend communication.
 * Handles chat streaming, project export, and other backend operations.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
import { Node, Edge } from "reactflow";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: {
    agent?: string;
    type?: "text" | "tool_call" | "tool_result" | "notice" | "error";
  };
}

export interface ChatContext {
  unitId?: string;
  unitLabel?: string;
  unitKind?: string;
  via?: string;
  viaLabel?: string;
  viaKind?: string;
  lineage?: string[];
}

export interface ChatEvent {
  type: "text" | "tool_call" | "tool_result" | "notice" | "error";
  data: {
    delta?: string;
    message?: string;
    name?: string;
    args?: unknown;
    result?: unknown;
  };
  context?: ChatContext;
}

export interface Project {
  id: string;
  name: string;
  graph: {
    nodes: Node[];
    edges: Edge[];
  };
  settings: {
    defaultProvider?: string;
    defaultModel?: string;
    teamDirectorLabel?: string;
    teamDirectorStrategy?: string;
  };
}

export interface ChatRequest {
  projectId: string;
  target: string;
  message: string;
  thread?: string;
  mcp?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ToolCatalogItem {
  subtype: string;
  label: string;
  category: "hosted" | "mcp" | "function" | string;
  description?: string;
  module?: string;
  requires?: string[];
  sample_prompts?: string[];
  source?: string;
}

export interface CapabilityBundle {
  id: string;
  title: string;
  description: string;
  category: string;
  summary?: string;
  tags: string[];
  nodes: Node[];
  edges: Edge[];
}

export interface PlaybookMetadata {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  version?: string;
  author?: string;
}

export interface Playbook {
  metadata: PlaybookMetadata;
  project: Project;
  notes?: string;
  placeholders?: Record<string, unknown>;
}

export interface PlaybookListItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  updated_at: string;
  node_count: number;
  edge_count: number;
}

export interface EvaluationScenario {
  id: string;
  name: string;
  description?: string;
  target_agent: string;
  messages: ScenarioMessage[];
  assertions: ScenarioAssertion[];
  created_at: string;
  updated_at: string;
}

export interface ScenarioMessage {
  role: string;
  content: string;
}

export interface ScenarioAssertion {
  description: string;
  contains?: string;
  not_contains?: string;
  equals?: string;
}

export interface EvaluationListItem {
  id: string;
  name: string;
  description?: string;
  target_agent: string;
  updated_at: string;
}

export interface EvaluationResult {
  scenario_id: string;
  passed: boolean;
  failures: string[];
  transcript: ScenarioMessage[];
  metadata: Record<string, unknown>;
}

/**
 * Stream chat responses from the backend using SSE.
 */
export async function* streamChat(
  request: ChatRequest
): AsyncGenerator<ChatEvent, void, unknown> {
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Chat stream failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process line-delimited JSON
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const event: ChatEvent = JSON.parse(line);
            yield event;
          } catch (e) {
            console.error("Failed to parse chat event:", line, e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Send a chat message and get the complete response (non-streaming).
 */
export async function sendChat(request: ChatRequest): Promise<{
  text: string;
  events: ChatEvent[];
}> {
  const response = await fetch(`${API_BASE_URL}/api/chat/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Export a project as a ZIP file.
 */
export async function exportProject(project: Project): Promise<{ url: string; filename?: string }> {
  const response = await fetch(`${API_BASE_URL}/api/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ project }),
  });

  if (!response.ok) {
    // Try to extract JSON error if present
    const text = await response.text().catch(() => null);
    try {
      const json = text ? JSON.parse(text) : null;
      throw new Error(json?.detail || response.statusText);
    } catch {
      throw new Error(`Export failed: ${response.statusText}`);
    }
  }

  // Response is a binary ZIP. Create blob URL to trigger download.
  const blob = await response.blob();

  // Try to get filename from Content-Disposition header
  const disposition = response.headers.get("Content-Disposition") || response.headers.get("content-disposition");
  let filename: string | undefined;
  if (disposition) {
    const match = /filename\*?=(?:UTF-8'')?"?([^;"']+)"?/.exec(disposition);
    if (match) filename = decodeURIComponent(match[1]);
  }

  const url = URL.createObjectURL(blob);
  return { url, filename };
}

/**
 * Cache a project on the backend for testing.
 * In production, this would be handled by the backend storage layer.
 */
export async function cacheProject(project: Project): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat/cache`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(project),
  });

  if (!response.ok) {
    throw new Error(`Failed to cache project: ${response.statusText}`);
  }
}

/**
 * Generate nodes and edges from natural language description.
 */
export interface ConversationTurn {
  role: string;
  content: string;
}

export interface AttachmentUpload {
  filename: string;
  contentType?: string;
  base64: string;
}

export interface GraphGenerationRequest {
  message: string;
  currentGraph?: { nodes: Node[]; edges: Edge[] };
  conversation?: ConversationTurn[];
  attachments?: AttachmentUpload[];
  toolHints?: string[];
  workflowPreference?: string;
}

export async function generateGraph(options: GraphGenerationRequest): Promise<{
  nodes: Node[];
  edges: Edge[];
  success: boolean;
  message: string;
  raw_response?: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/generate/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: options.message,
      current_graph: options.currentGraph,
      context: options.conversation?.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      assets: options.attachments?.map((asset) => ({
        filename: asset.filename,
        content_type: asset.contentType,
        base64: asset.base64,
      })),
      preferred_tools: options.toolHints,
      workflow_preference: options.workflowPreference,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Generation failed: ${response.statusText}`);
  }

  return response.json();
}

export type GenerateStreamEvent =
  | { type: "status"; data: string }
  | { type: "text"; data: { delta: string } }
  | { type: "result"; data: { nodes: Node[]; edges: Edge[]; message: string; success: boolean; raw_response?: string } }
  | { type: "error"; data: { message: string } };

export async function generateGraphStream(
  options: GraphGenerationRequest,
  onEvent: (event: GenerateStreamEvent) => void
): Promise<{ nodes: Node[]; edges: Edge[]; message: string; success: boolean; raw_response?: string }> {
  const response = await fetch(`${API_BASE_URL}/api/generate/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: options.message,
      current_graph: options.currentGraph,
      context: options.conversation?.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      assets: options.attachments?.map((asset) => ({
        filename: asset.filename,
        content_type: asset.contentType,
        base64: asset.base64,
      })),
      preferred_tools: options.toolHints,
      workflow_preference: options.workflowPreference,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Generation failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Streaming response body is undefined");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalPayload: GenerateStreamEvent | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as GenerateStreamEvent;
        onEvent(parsed);
        if (parsed.type === "result" || parsed.type === "error") {
          finalPayload = parsed;
        }
      } catch (error) {
        console.error("Failed to parse stream event", error, line);
      }
    }
  }

  if (!finalPayload) {
    throw new Error("Stream ended without result");
  }

  if (finalPayload.type === "error") {
    throw new Error(finalPayload.data.message);
  }

  return finalPayload.data;
}

/**
 * Check backend health.
 */
export async function checkHealth(): Promise<{
  status: string;
  provider: string;
  model: string;
}> {
  const response = await fetch(`${API_BASE_URL}/api/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch the tool catalog metadata for discovery UI.
 */
export async function fetchToolCatalog(): Promise<ToolCatalogItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/tools/catalog`);
  if (!response.ok) {
    throw new Error(`Failed to load tool catalog: ${response.statusText}`);
  }
  const data = await response.json();
  return data.items ?? [];
}

export async function fetchCapabilityBundles(): Promise<CapabilityBundle[]> {
  const response = await fetch(`${API_BASE_URL}/api/tools/bundles`);
  if (!response.ok) {
    throw new Error(`Failed to load capability bundles: ${response.statusText}`);
  }
  const data = await response.json();
  return data.items ?? [];
}

export async function fetchPlaybooks(): Promise<PlaybookListItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/playbooks`);
  if (!response.ok) {
    throw new Error(`Failed to load playbooks: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchPlaybook(playbookId: string): Promise<Playbook> {
  const response = await fetch(`${API_BASE_URL}/api/playbooks/${encodeURIComponent(playbookId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load playbook: ${response.statusText}`);
  }
  return response.json();
}

export async function savePlaybook(playbook: Playbook): Promise<Playbook> {
  const response = await fetch(`${API_BASE_URL}/api/playbooks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(playbook),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Failed to save playbook: ${response.statusText}`);
  }
  return response.json();
}

export async function deletePlaybook(playbookId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/playbooks/${encodeURIComponent(playbookId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Failed to delete playbook: ${response.statusText}`);
  }
}

export async function fetchEvaluationScenarios(): Promise<EvaluationListItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/evaluations`);
  if (!response.ok) {
    throw new Error(`Failed to load evaluation scenarios: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchEvaluationScenario(id: string): Promise<EvaluationScenario> {
  const response = await fetch(`${API_BASE_URL}/api/evaluations/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Failed to load evaluation scenario: ${response.statusText}`);
  }
  return response.json();
}

export async function saveEvaluationScenario(scenario: EvaluationScenario): Promise<EvaluationScenario> {
  const response = await fetch(`${API_BASE_URL}/api/evaluations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(scenario),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Failed to save evaluation scenario: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteEvaluationScenario(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/evaluations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Failed to delete evaluation scenario: ${response.statusText}`);
  }
}

export async function runEvaluationScenario(id: string, project: Project): Promise<EvaluationResult> {
  const response = await fetch(`${API_BASE_URL}/api/evaluations/${encodeURIComponent(id)}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ project }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Failed to run evaluation scenario: ${response.statusText}`);
  }
  return response.json();
}


/**
 * Validate a project against backend export checks.
 */
export async function validateProject(project: Project): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const response = await fetch(`${API_BASE_URL}/api/export/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ project }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || `Validation failed: ${response.statusText}`);
  }

  return response.json();
}



