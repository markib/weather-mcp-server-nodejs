import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";



// Define tool input schemas using Zod
const GetWeatherInput = z.object({
    location: z.string().describe('City name or coordinates'),
    units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
});

const GetForecastInput = z.object({
    location: z.string(),
    days: z.number().min(1).max(7).optional().default(3),
});

// Mock weather data (replace with real API calls)
const weatherData: Record<string, any> = {
    'new york': { temp: 18, condition: 'Partly Cloudy', humidity: 65 },
    'london': { temp: 12, condition: 'Rainy', humidity: 82 },
    'tokyo': { temp: 22, condition: 'Sunny', humidity: 55 },
    'saigon': { temp: 32, condition: 'Hot', humidity: 78 },
};

// Create an MCP server
class WeatherMCPServer {
    private server: McpServer;

    constructor() {
        this.server = new McpServer(
            {
                name: 'weather-mcp-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
    }

    private setupHandlers() {
        // Register tools
        this.server.registerTool(
            'get_current_weather',
            {
                description: 'Get current weather for a specific location',
                inputSchema: GetWeatherInput,
            },
            async (args) => {
                return await this.getCurrentWeather(args);
            }
        );

        this.server.registerTool(
            'get_forecast',
            {
                description: 'Get weather forecast for multiple days',
                inputSchema: GetForecastInput,
            },
            async (args) => {
                return await this.getForecast(args);
            }
        );
    }

    private async getCurrentWeather(args: z.infer<typeof GetWeatherInput>) {
        const locationLower = args.location.toLowerCase();

        const weather = weatherData[locationLower];

        if (!weather) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Weather data not found for "${args.location}". Try: New York, London, Tokyo, or Saigon.`,
                    },
                ],
            };
        }

        const temp = args.units === 'fahrenheit'
            ? (weather.temp * 9 / 5) + 32
            : weather.temp;
        const unitSymbol = args.units === 'fahrenheit' ? '°F' : '°C';

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify({
                        location: args.location,
                        temperature: `${temp}${unitSymbol}`,
                        condition: weather.condition,
                        humidity: `${weather.humidity}%`,
                    }, null, 2),
                },
            ],
        };
    }

    private async getForecast(args: z.infer<typeof GetForecastInput>) {
        const locationLower = args.location.toLowerCase();

        const weather = weatherData[locationLower];

        if (!weather) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Location "${args.location}" not found.`,
                    },
                ],
            };
        }

        // Generate mock forecast
        const forecast = [];
        for (let i = 0; i < args.days; i++) {
            const dayTemp = weather.temp + Math.floor(Math.random() * 6) - 3;
            forecast.push({
                day: i + 1,
                temp: `${dayTemp}°C`,
                condition: weather.condition,
            });
        }

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify({
                        location: args.location,
                        forecast,
                    }, null, 2),
                },
            ],
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Weather MCP Server running on stdio');
    }
}

const server = new WeatherMCPServer();
server.run().catch(console.error);