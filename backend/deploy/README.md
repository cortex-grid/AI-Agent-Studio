# Azure Deployment Templates for Agent Canvas

This directory contains deployment templates for Azure.

## Templates

### 1. Azure Web Apps (App Service)
- **File**: `webapp.bicep`
- **Use Case**: Production deployments with auto-scaling
- **Features**: Linux container, managed identity, env variables

### 2. Azure Container Apps
- **File**: `containerapp.bicep`
- **Use Case**: Microservices, event-driven workloads
- **Features**: Serverless containers, KEDA scaling, ingress

### 3. Azure Functions
- **File**: `function.bicep`
- **Use Case**: Event-driven processing, scheduled tasks
- **Features**: Consumption plan, serverless execution

## Quick Deploy

### Azure Web App

```bash
# 1. Build and push Docker image
docker build -t <your-registry>.azurecr.io/agent-canvas:latest .
docker push <your-registry>.azurecr.io/agent-canvas:latest

# 2. Deploy with Bicep
az group create --name agent-canvas-rg --location eastus
az deployment group create \
  --resource-group agent-canvas-rg \
  --template-file webapp.bicep \
  --parameters \
    appName=agent-canvas-app \
    dockerImage=<your-registry>.azurecr.io/agent-canvas:latest \
    openaiApiKey=<your-key>
```

### Azure Container Apps

```bash
az deployment group create \
  --resource-group agent-canvas-rg \
  --template-file containerapp.bicep \
  --parameters \
    appName=agent-canvas \
    containerImage=<your-registry>.azurecr.io/agent-canvas:latest
```

## Environment Variables

Set these in your deployment:

```bash
PROVIDER=openai
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=gpt-4o-mini

# Or for Azure
PROVIDER=azure
AZURE_AI_PROJECT_ENDPOINT=<endpoint>
```

## CI/CD

See `azure-pipelines.yml` and `.github/workflows/deploy.yml` for automated deployment workflows.
