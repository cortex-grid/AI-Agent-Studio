@description('Name of the web app')
param appName string

@description('Location for all resources')
param location string = resourceGroup().location

@description('Docker image to deploy')
param dockerImage string

@description('OpenAI API Key')
@secure()
param openaiApiKey string = ''

@description('Azure AI Project Endpoint')
param azureAiProjectEndpoint string = ''

@description('Provider (openai or azure)')
@allowed([
  'openai'
  'azure'
])
param provider string = 'openai'

@description('Model name')
param modelName string = 'gpt-4o-mini'

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: '${appName}-plan'
  location: location
  kind: 'linux'
  properties: {
    reserved: true
  }
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
}

// Web App
resource webApp 'Microsoft.Web/sites@2022-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${dockerImage}'
      alwaysOn: true
      appSettings: [
        {
          name: 'PROVIDER'
          value: provider
        }
        {
          name: 'OPENAI_API_KEY'
          value: openaiApiKey
        }
        {
          name: 'OPENAI_MODEL'
          value: modelName
        }
        {
          name: 'AZURE_AI_PROJECT_ENDPOINT'
          value: azureAiProjectEndpoint
        }
        {
          name: 'PORT'
          value: '8000'
        }
        {
          name: 'HOST'
          value: '0.0.0.0'
        }
        {
          name: 'WEBSITES_PORT'
          value: '8000'
        }
      ]
      cors: {
        allowedOrigins: [
          '*'
        ]
        supportCredentials: false
      }
    }
    httpsOnly: true
  }
}

output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output webAppName string = webApp.name
output principalId string = webApp.identity.principalId
