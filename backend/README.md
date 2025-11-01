# Agent Canvas Backend

MAF-powered backend for agent orchestration and export.

## Overview

This backend uses the **Microsoft Agent Framework (MAF)** to:
- Create and manage AI agents (OpenAI or Azure)
- Orchestrate multi-agent teams with sequential/concurrent patterns
- Stream chat responses via SSE
- Export runnable projects as ZIP files

## Architecture

```
app/
├── main.py              # FastAPI app with CORS and routing
├── config.py            # Environment variable configuration
├── routers/
│   ├── chat.py         # Chat streaming endpoints
│   └── export.py       # Project export endpoints
├── services/
│   ├── agent_factory.py    # Creates MAF ChatAgent instances
│   ├── tool_factory.py     # Creates MAF tool instances (MCP, Hosted, Function)
│   ├── team_manager.py     # Orchestrates agents using MAF patterns
│   └── exporter.py         # Generates project ZIP files
└── models/
    ├── project.py      # Pydantic models for Project/Graph/Node/Edge
    └── messages.py     # Pydantic models for ChatRequest/ChatEvent
```

## Setup

### 1. Install Dependencies

```bash
cd backend
poetry install
```

Or with pip:

```bash
pip install -r requirements.txt  # (generate from pyproject.toml)
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**For OpenAI:**
```env
PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
```

**For Azure:**
```env
PROVIDER=azure
AZURE_AI_PROJECT_ENDPOINT=https://your-project.api.azureml.ms
AZURE_AI_PROJECT_SUBSCRIPTION_ID=your-subscription-id
AZURE_AI_PROJECT_RESOURCE_GROUP=your-resource-group
AZURE_AI_PROJECT_NAME=your-project-name
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
```

**For MCP Tools:**
```env
MCP_ENDPOINTS=http://localhost:3000,http://localhost:3001
```

**For Hosted Tools (Google/Bing Search):**
```env
GOOGLE_SEARCH_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id
BING_SEARCH_API_KEY=your-bing-api-key
```

### 3. Run the Server

```bash
poetry run uvicorn app.main:app --reload --port 8000
```

Or:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

## API Endpoints

### Health Check
```
GET /api/health
```
Returns server status and config info.

### Export Project
```
POST /api/export
Content-Type: application/json

{
  "project": {
    "id": "project-123",
    "name": "My Team",
    "graph": {
      "nodes": [...],
      "edges": [...]
    },
    "settings": {...}
  }
}
```
Returns:
```json
{
  "downloadPath": "/api/export/download/export-123.zip"
}
```

```
GET /api/export/download/{filename}
```
Downloads the exported ZIP file.

### Chat (Streaming)
```
POST /api/chat/stream
Content-Type: application/json

{
  "projectId": "project-123",
  "target": "team",
  "message": "Hello!",
  "thread": "thread-1",
  "mcp": {...}
}
```
Returns SSE stream (line-delimited JSON):
```
{"type":"notice","data":{"message":"Starting team execution..."}}
{"type":"text","data":{"delta":"Hello"}}
{"type":"text","data":{"delta":" world"}}
{"type":"notice","data":{"message":"Execution complete"}}
```

### Chat (Non-Streaming)
```
POST /api/chat/run
Content-Type: application/json

{
  "projectId": "project-123",
  "target": "agent-456",
  "message": "What's the weather?"
}
```
Returns:
```json
{
  "text": "The weather is sunny today.",
  "events": [...]
}
```

## Microsoft Agent Framework Integration

### AgentFactory
Creates `ChatAgent` instances using MAF:
- **OpenAI**: Uses `OpenAIChatClient` with API key
- **Azure**: Uses `AzureAIAgentClient` with `AzureCliCredential`

### ToolFactory
Creates MAF tools:
- **MCP Tools**: `MCPStreamableHTTPTool` for Model Context Protocol servers
- **Hosted Tools**: `HostedCodeInterpreterTool`, `HostedFileSearchTool`, `HostedWebSearchTool`
- **Function Tools**: Custom Python functions with OpenAI function schema

### TeamManager
Orchestrates agents using MAF patterns:
- **Sequential**: Agents run one after another
- **Concurrent**: Agents run in parallel with fan-out/fan-in
- **Magentic**: Planning with checkpoints and human review

Streams events using `agent.run_stream()` and emits normalized events for the frontend.

## Development

### Project Cache
Chat endpoints use an in-memory `_projects` dict. In production, replace with a database:

```python
from app.routers.chat import _set_project

# Cache project for testing
_set_project("project-123", project_data)
```

### Adding New Tools
1. Add tool subtype to `ToolFactory.build_tool()` dispatcher
2. Implement builder method (e.g., `build_custom_tool()`)
3. Return MAF tool instance

### Adding Orchestration Strategies
Update `TeamManager.run_stream()` to support new strategies:
```python
if strategy == "magentic":
    # Use MAF MagenticBuilder with planning
    pass
elif strategy == "concurrent":
    # Use MAF ConcurrentBuilder with fan-out/fan-in
    pass
```

## Testing

```bash
# Test health endpoint
curl http://localhost:8000/api/health

# Test export (requires project in cache)
curl -X POST http://localhost:8000/api/export \
  -H "Content-Type: application/json" \
  -d @test_project.json

# Test chat streaming
curl -X POST http://localhost:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"projectId":"project-123","message":"Hello"}'
```

## Troubleshooting

### Import Errors
If you see `agent_framework` import errors, ensure dependencies are installed:
```bash
poetry install
```

### Azure Authentication
For Azure, ensure you're logged in with Azure CLI:
```bash
az login
```

### MCP Server Not Responding
Check that MCP servers are running on configured endpoints:
```bash
curl http://localhost:3000/health
```

## License

MIT
