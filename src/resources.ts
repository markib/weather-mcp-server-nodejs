import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register read-only resources on the given MCP server.
 * Resources are queryable by AI agents via URI scheme.
 */
export function registerResources(server: McpServer) {
  // config:// resource - static configuration data
  server.registerResource(
    'app-config',
    'config://weather-mcp-server/app-config',
    {
      title: 'Weather MCP Server Configuration',
      description: 'Current server configuration values for debugging and introspection',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'config://weather-mcp-server/app-config',
          text: JSON.stringify(
            {
              name: 'weather-mcp-server',
              version: '1.0.0',
              supportedCities: ['New York', 'London', 'Tokyo', 'Saigon'],
              maxForecastDays: 7,
            },
            null,
            2
          ),
        },
      ],
    })
  );

  // data:// resource - dynamic data (simulated)
  server.registerResource(
    'weather-data-cities',
    'data://weather-mcp-server/cities',
    {
      title: 'Supported Weather Cities',
      description: 'List of cities currently supported by weather tools',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'data://weather-mcp-server/cities',
          text: JSON.stringify(['New York', 'London', 'Tokyo', 'Saigon'], null, 2),
        },
      ],
    })
  );

  // file:// resource - file-like data object
  server.registerResource(
    'terms-of-service',
    'file://weather-mcp-server/terms-of-service.txt',
    {
      title: 'Terms of Service',
      description: 'A basic terms of service for the weather MCP API usage',
      mimeType: 'text/plain',
    },
    async () => ({
      contents: [
        {
          uri: 'file://weather-mcp-server/terms-of-service.txt',
          text: `Weather MCP Server Terms of Service\n\nThis server is provided for demonstration. Data is synthetic and provided without warranty.`,
        },
      ],
    })
  );
}
