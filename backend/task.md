Awesome—let’s lock the **backend blueprint** so you (and Copilot) can implement it fast. I’m basing this on the MAF patterns in your `MAF.md` (MCP tools, agent creation, threads, orchestration, streaming, hosted tools). I’ll give you:

1. Architecture & runtime responsibilities
2. File layout + module responsibilities
3. API contract (stable for your UI & for the export template)
4. Core classes (TeamManager, AgentFactory, ToolFactory)
5. Streaming & threads model
6. MCP, Hosted Tools, Function Tools integration
7. Token/rate-limit strategy + validation
8. Config/env & local run
9. Exportable backend template structure

Citations below point to the relevant examples in `MAF.md` so Copilot knows which idioms to follow.

---

# 1) Runtime architecture

* **FastAPI** app exposes a single stable base: `/api`.
* **TeamManager** owns the public chat endpoint and orchestrates child `ChatAgent`s (your “team manager” is a composition pattern on top of MAF—not a special type). Use **sequential / concurrent / Magentic** builders as needed.
* **AgentFactory** creates `ChatAgent`s for either **OpenAI** or **Azure OpenAI/Azure AI** based on project config. (MAF shows both OpenAIChatClient / AzureAIAgentClient creation.)
* **ToolFactory** attaches tools:

  * **MCP** via `MCPStreamableHTTPTool` (agent-level or run-level).
  * **Hosted tools**: Code Interpreter, File Search, Web Search (Bing grounding).
  * **Function tools**: Python callables on-demand. 
* **Threading**:

  * “Team thread” by default (manager maintains conversation for the whole graph).
  * Optional “per-agent thread” mode (isolate memory), still available via MAF’s thread helpers.
* **Streaming**: stream tokens & tool events back to the UI (SSE or WS) using `run_stream` and the raw update structures when needed (esp. for hosted tools).

---

# 2) Repository layout

```
backend/
  app/
    __init__.py
    main.py                 # FastAPI app, routers include
    config.py               # env & settings
    models/
      project.py            # Pydantic models for Project/Graph/Agent/Tool
      messages.py           # request/response DTOs (chat, validate, export)
    services/
      team_manager.py       # TeamManager (builds workflows, runs/streams)
      agent_factory.py      # creates ChatAgents from spec
      tool_factory.py       # builds MCP/Hosted/Function tools
      validation.py         # static checks & token budgeting
      exporter.py           # zip generator for export template
      storage.py            # local file storage for projects
    routers/
      projects.py           # /api/projects CRUD (file-based for now)
      chat.py               # /api/chat (stream) & /api/run (non-stream)
      validate.py           # /api/validate
      export.py             # /api/export
    utils/
      json_io.py, sse.py, ids.py, logging.py
  tests/
    test_chat.py, test_validate.py
  pyproject.toml
  README.md
```

---

# 3) API contract (stable)

**All routes live under `/api`.**

### `GET /api/projects`

List projects (id, name, updatedAt).

### `POST /api/projects`

Create project: `{name}` → returns `{id, ...}`.

### `GET /api/projects/{id}`

Return full spec `{ settings, graph, agents, tools, edges }`.

### `PUT /api/projects/{id}`

Save spec.

### `POST /api/chat`  *(streaming recommended)*

**Body**:

```json
{
  "projectId": "uuid",
  "target": "team|<agentId>",
  "message": "string",
  "thread": "auto|new|<threadId>",
  "mcp": true,
  "metadata": { "userId": "opt", "tags": [] }
}
```

**Stream**: events of `{type: "text"|"tool_call"|"tool_result"|"notice"|"error", data: {...}}` (SSE)
(MAF run_stream & raw updates for hosted tools/code interpreter).

### `POST /api/run`

Same as `/api/chat` but non-stream; returns `{text, tool_calls?, raw?}`.

### `POST /api/validate`

Returns `{ issues: [ {level, message, nodeId?} ], estTokens: {input, output}, needsChunking: bool }`.

### `POST /api/export`

Returns `{ downloadUrl, summary }` and generates a zip (see §9).

---

# 4) Data model (Pydantic-ready)

```json
{
  "id": "uuid",
  "name": "Customer Support Team",
  "settings": {
    "defaultProvider": "openai|azure",
    "defaultModel": "gpt-4o-mini|<azure-deployment-name>",
    "threadPolicy": "team|perAgent",
    "mcp": [
      {"id":"mcp-1","name":"Microsoft Learn MCP","url":"https://learn.microsoft.com/api/mcp","approval":"off|always_require"}
    ]
  },
  "graph": {
    "nodes": [
      {
        "id": "mgr-1",
        "kind": "teamManager",
        "data": { "strategy": "sequential|concurrent|magentic" }
      },
      {
        "id": "agent-planner",
        "kind": "agent",
        "data": {
          "name": "Planner",
          "provider": "openai|azure",
          "model": "gpt-4o-mini|<azure-deployment>",
          "system": "You are a helpful planning agent...",
          "tools": ["tool-code", "tool-file", "mcp-docs"],
          "temperature": 0.2
        }
      },
      {
        "id": "tool-code",
        "kind": "tool",
        "subtype": "hostedCodeInterpreter|hostedFileSearch|function|mcp",
        "data": {"name": "Code Interpreter", "args": {}, "functionRef": "py://tools/math.sum"}
      }
    ],
    "edges": [
      {
        "id": "e1",
        "source": "mgr-1",
        "target": "agent-planner",
        "data": { "when":"always|on_tool_result|if", "filter":"keywords|expr" }
      }
    ]
  }
}
```

---

# 5) Core classes (behavior-level spec)

### `AgentFactory`

* Inputs: node `data` (provider, model, system, tools list, temps)
* Creates `ChatAgent` with **OpenAIChatClient** or **AzureAIAgentClient** (or OpenAIResponsesClient if you need structured output).
* Attaches tools with **ToolFactory**:

  * Agent-level tools at creation (preferred). Run-level tools still supported. 
* Provides `get_thread(policy, agentId)`:

  * `team` → hand back the shared TeamManager thread
  * `perAgent` → per-agent persistent thread using MAF helpers 

### `ToolFactory`

* `build_mcp(toolSpec)` → `MCPStreamableHTTPTool` or hosted MCP with approvals.
* `build_hosted_code_interpreter()` → `HostedCodeInterpreterTool` with helpers to surface inputs/outputs in stream. 
* `build_hosted_file_search()` → HostedFileSearchTool. 
* `build_function_tool(ref)` → wrap a Python callable with proper annotations.

### `TeamManager`

* Loads graph, instantiates agents, builds orchestration:

  * **Sequential** (`SequentialBuilder.participants([...]).build()`) to chain agents with shared conversation context. 
  * **Concurrent** fan-out/fan-in via ConcurrentBuilder (optional). 
  * **Magentic** when you want planning/checkpoints/human review. Respect stable participant names if resuming. 
* `run(message, target, threadPolicy, mcp)`:

  * If `target=="team"`: run the chosen workflow and **stream events**.
  * If `target=="<agentId>"`: call that agent’s `run`/`run_stream`.
* Emits normalized events for frontend: `text`, `tool_call`, `tool_result`, `notice`, `error`.
* Applies **approvals** for MCP calls if tool is `approval_mode=always_require`. 

---

# 6) Streaming model

Use SSE or WebSocket. In both cases, back-pressure friendly, line-delimited JSON:

```json
{ "type":"text","data":{"delta":"..."} }
{ "type":"tool_call","data":{"name":"microsoft_docs_search","args":{...}} }
{ "type":"tool_result","data":{"name":"microsoft_docs_search","text":"..."} }
{ "type":"notice","data":{"message":"planner → coder"} }
```

* For hosted tools like **Code Interpreter**, surface the **raw stream** chunks if needed (MAF shows how to inspect `ChatResponseUpdate` and `RunStepDeltaCodeInterpreterDetailItemObject`). 

---

# 7) Validation & token/rate-limit policy

* **Static checks** (`/api/validate`):

  * missing provider/model
  * unreachable MCP URL (try pre-connect)
  * disconnected agents / cycles
* **Token budgeting**:

  * Compact prompts: only include **system**, **latest N messages**, and **tool schema hints**.
  * If estimated payload > budget: **chunk** into sub-runs (plan → per-agent execution).
* **429 guard**:

  * Exponential backoff with jitter; **queue** module runs; cap max concurrency per org.
  * Prefer smaller models for planning; bigger for generation (pattern used earlier).
* **Thread hygiene**:

  * Use `get_new_thread()` for long sessions that need continuity. 

---

# 8) Configuration & local run

**Env**

```
PROVIDER=openai|azure
OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=...
AZURE_OPENAI_DEPLOYMENT=...
MCP_ENDPOINTS='[{"name":"Microsoft Learn MCP","url":"https://learn.microsoft.com/api/mcp"}]'
```

* For Azure AI examples that need credentials, support `AzureCliCredential` (`az login`) as the default. 

**Dev commands**

* `uvicorn app.main:app --reload`
* Optional: `make dev` to start both backend and the exported Vite app.

---

# 9) Exportable backend template (what the ZIP contains)

```
exported/
  backend/
    app/
      main.py                # FastAPI with the same /api contract
      team_manager.py        # generated from graph.json
      agent_factory.py       # generated subset (only used agents/tools)
      tool_factory.py
      project.json           # the exported graph
      config.py              # reads .env; chooses provider/model
      utils/sse.py
    pyproject.toml
    README.md                # "uvicorn app.main:app --reload"
  frontend/
    vite.config.ts
    src/
      App.tsx                # chat + read-only canvas preview
      api.ts                 # points to /api
      ...
  .env.example
```

The generator copies your **current project** to `project.json` and emits minimal orchestrator code that reconstructs the team at boot, exactly matching your runtime. (For Magentic with checkpoints, keep participant names stable per MAF note. ) 

---

## What Copilot will need from you (next)

* Skeleton `TeamManager.run_stream()` signature with TODOs:

  * Build orchestration from graph
  * Decide thread per project settings
  * Yield normalized events while consuming MAF `run_stream` events
* `ToolFactory` stubs for MCP/Hosted/Function tools with TODOs for mapping UI fields → constructor args
* `AgentFactory` stub that switches between OpenAI and Azure clients
* Router stubs that call manager and stream back SSE

Those stubs + this spec are enough for Copilot to fill in the implementations using the patterns demonstrated in your `MAF.md` samples (MCP at agent/run level, threads, streaming, hosted tools, orchestration).

If you want, I can also draft the **Pydantic models** (Project/Node/Edge) and the **SSE helper** so Copilot has concrete types to anchor on.
