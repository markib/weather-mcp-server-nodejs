import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ============================================================================
// Type-Safe Tool Definitions with Input and Output Schemas
// ============================================================================

// Weather data type
interface WeatherData {
    temp: number;
    condition: string;
    humidity: number;
}

// Input schemas with descriptions
const GetWeatherInput = z.object({
    location: z.string().describe('City name or coordinates'),
    units: z.enum(['celsius', 'fahrenheit']).describe('Temperature units').optional().default('celsius'),
});

const GetForecastInput = z.object({
    location: z.string().describe('City name'),
    days: z.number().int().min(1).max(7).describe('Number of forecast days').optional().default(3),
});

// Output schemas for type safety
const WeatherOutputSchema = z.object({
    location: z.string(),
    temperature: z.string(),
    condition: z.string(),
    humidity: z.string(),
});

const ForecastOutputSchema = z.object({
    location: z.string(),
    forecast: z.array(z.object({
        day: z.number(),
        temp: z.string(),
        condition: z.string(),
    })),
});

// Type inference from schemas
type GetWeatherInputType = z.infer<typeof GetWeatherInput>;
type GetForecastInputType = z.infer<typeof GetForecastInput>;
type WeatherOutputType = z.infer<typeof WeatherOutputSchema>;
type ForecastOutputType = z.infer<typeof ForecastOutputSchema>;

// Mock weather data with proper typing
const weatherData: Record<string, WeatherData> = {
    'new york': { temp: 18, condition: 'Partly Cloudy', humidity: 65 },
    'london': { temp: 12, condition: 'Rainy', humidity: 82 },
    'tokyo': { temp: 22, condition: 'Sunny', humidity: 55 },
    'saigon': { temp: 32, condition: 'Hot', humidity: 78 },
};

// ============================================================================
// Helper Functions for Type-Safe Responses
// ============================================================================

/**
 * Create a text content response with common structure
 */
function createTextResponse(text: string): CallToolResult {
    return {
        content: [
            {
                type: 'text' as const,
                text,
            },
        ],
    };
}

/**
 * Create a JSON response with validation
 */
function createJsonResponse<T>(data: T, schema?: z.ZodSchema<T>): CallToolResult {
    if (schema) {
        schema.parse(data); // Validate the output
    }
    return createTextResponse(JSON.stringify(data, null, 2));
}

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
        // Register tools with type-safe handlers
        this.server.registerTool(
            'get_current_weather',
            {
                description: 'Get current weather for a specific location',
                inputSchema: GetWeatherInput,
            },
            async (args) => this.getCurrentWeather(args as GetWeatherInputType)
        );

        this.server.registerTool(
            'get_forecast',
            {
                description: 'Get weather forecast for multiple days',
                inputSchema: GetForecastInput,
            },
            async (args) => this.getForecast(args as GetForecastInputType)
        );
    }

    private async getCurrentWeather(args: GetWeatherInputType): Promise<CallToolResult> {
        const locationLower = args.location.toLowerCase();
        const weather = weatherData[locationLower];

        if (!weather) {
            return createTextResponse(
                `Weather data not found for "${args.location}". Try: New York, London, Tokyo, or Saigon.`
            );
        }

        const temp = this.convertTemperature(weather.temp, args.units);
        const unitSymbol = args.units === 'fahrenheit' ? '°F' : '°C';

        const output: WeatherOutputType = {
            location: args.location,
            temperature: `${temp}${unitSymbol}`,
            condition: weather.condition,
            humidity: `${weather.humidity}%`,
        };

        return createJsonResponse(output, WeatherOutputSchema);
    }

    /**
     * Convert temperature between Celsius and Fahrenheit
     */
    private convertTemperature(celsius: number, target: 'celsius' | 'fahrenheit'): number {
        if (target === 'fahrenheit') {
            return Math.round((celsius * 9 / 5 + 32) * 10) / 10;
        }
        return celsius;
    }

    private async getForecast(args: GetForecastInputType): Promise<CallToolResult> {
        const locationLower = args.location.toLowerCase();
        const weather = weatherData[locationLower];

        if (!weather) {
            return createTextResponse(`Location "${args.location}" not found.`);
        }

        // Generate mock forecast with proper typing
        const forecast = this.generateForecast(weather, args.days);

        const output: ForecastOutputType = {
            location: args.location,
            forecast,
        };

        return createJsonResponse(output, ForecastOutputSchema);
    }

    /**
     * Generate a forecast for the specified number of days
     */
    private generateForecast(
        weather: WeatherData,
        days: number
    ): Array<{ day: number; temp: string; condition: string }> {
        const forecast = [];
        for (let i = 0; i < days; i++) {
            const dayTemp = weather.temp + Math.floor(Math.random() * 6) - 3;
            forecast.push({
                day: i + 1,
                temp: `${dayTemp}°C`,
                condition: weather.condition,
            });
        }
        return forecast;
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Weather MCP Server running on stdio');
    }
}

const server = new WeatherMCPServer();
server.run().catch(console.error);