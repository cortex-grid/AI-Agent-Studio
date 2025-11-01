# Agent Templates

Pre-built agent team templates for common use cases.

## Available Templates

### 1. RAG Document Assistant (`rag-bot.json`)
**Use Case**: Document Q&A, Knowledge Base Search

**Agents**:
- RAG Coordinator (Team Manager) - Orchestrates retrieval and synthesis
- Document Searcher - Searches vector store for relevant context
- Answer Generator - Synthesizes comprehensive answers

**Tools**:
- File Search (Azure AI) - Vector search over documents

**Setup**:
1. Upload documents to Azure AI vector store
2. Update `vectorStoreId` in template
3. Test with: "What does the documentation say about authentication?"

---

### 2. DevOps Assistant (`devops-bot.json`)
**Use Case**: Code Analysis, CI/CD Automation, Script Generation

**Agents**:
- DevOps Coordinator - Breaks down complex DevOps tasks
- Code Analyzer - Analyzes code quality and security
- Script Generator - Creates deployment scripts and configs

**Tools**:
- Code Interpreter (Azure AI) - Python code execution
- File Search - Searches deployment documentation

**Setup**:
1. Configure OpenAI/Azure credentials
2. (Optional) Upload deployment docs to vector store
3. Test with: "Analyze this Dockerfile for security issues"

---

### 3. Customer Support Assistant (`support-bot.json`)
**Use Case**: Multi-channel Support, Helpdesk Automation

**Agents**:
- Support Coordinator - Routes queries through KB → Web → Response
- KB Searcher - Searches internal knowledge base
- Web Researcher - Searches web for current information
- Response Generator - Crafts professional responses

**Tools**:
- File Search (Azure AI) - Internal knowledge base
- Web Search (Google) - External information lookup

**Setup**:
1. Upload support docs to Azure AI vector store
2. Set `GOOGLE_SEARCH_API_KEY` environment variable
3. Update `vectorStoreId` in template
4. Test with: "How do I reset my password?"

---

## Using Templates

### Via API

```bash
# List available templates
curl http://localhost:8000/api/templates

# Load a template
curl http://localhost:8000/api/templates/rag-bot
```

### Via Frontend

1. Open Agent Studio
2. Click "Templates" in the palette
3. Select a template to load
4. Customize as needed
5. Test in Chat

### Programmatically

```python
import json

# Load template
with open("templates/rag-bot.json") as f:
    template = json.load(f)

# Customize
template["graph"]["nodes"][0]["data"]["model"] = "gpt-4o"
template["settings"]["defaultProvider"] = "azure"

# Use in your application
```

## Customization

### Changing Models

Edit `data.model` for each agent:
```json
{
  "data": {
    "model": "gpt-4o"  // Change to gpt-4o-mini, gpt-4, etc.
  }
}
```

### Changing Providers

Update `settings.defaultProvider` and agent `data.provider`:
```json
{
  "settings": {
    "defaultProvider": "azure"
  },
  "graph": {
    "nodes": [{
      "data": {
        "provider": "azure"
      }
    }]
  }
}
```

### Adding Custom Tools

Add new tool nodes to the graph:
```json
{
  "id": "tool-custom",
  "type": "tool",
  "kind": "tool",
  "data": {
    "label": "Custom Tool",
    "subtype": "mcp-tool",
    "toolConfig": {
      "endpoint": "http://localhost:3000"
    }
  }
}
```

Connect to agents via edges:
```json
{
  "id": "e-custom",
  "source": "agent-id",
  "target": "tool-custom"
}
```

## Creating Your Own Templates

1. Design your agent team in Agent Studio
2. Export the project
3. Copy `project.json` to `templates/your-bot.json`
4. Add metadata section:
```json
{
  "metadata": {
    "template": true,
    "category": "Your Category",
    "tags": ["tag1", "tag2"],
    "setupInstructions": "1. Step one\n2. Step two"
  }
}
```

## Best Practices

### Agent Specialization
- Keep agents focused on specific tasks
- Use clear, directive system prompts
- Avoid overlapping responsibilities

### Tool Selection
- Use File Search for internal documents
- Use Web Search for current information
- Use Code Interpreter for data analysis

### Team Orchestration
- **Sequential**: When tasks depend on previous results
- **Concurrent**: When tasks can run in parallel
- **Magentic**: When you need planning and review steps

### Cost Optimization
- Use `gpt-4o-mini` for routing and simple tasks
- Use `gpt-4o` for complex reasoning
- Cache frequent searches in vector stores

## Support

For issues or questions:
- Agent Canvas: GitHub repository
- Microsoft Agent Framework: MAF documentation
- Azure AI: Azure AI documentation
