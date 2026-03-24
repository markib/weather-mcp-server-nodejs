import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ============================================================================
// Custom Error Classes for Proper Error Handling
// ============================================================================

/**
 * Base application error class
 */
class AppError extends Error {
    constructor(message: string, public code: string = 'INTERNAL_ERROR') {
        super(message);
        this.name = 'AppError';
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

/**
 * Validation error for invalid input data
 */
class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

/**
 * Not found error for missing resources
 */
class NotFoundError extends AppError {
    constructor(resource: string) {
        super(`${resource} not found`, 'NOT_FOUND');
        this.name = 'NotFoundError';
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }
}

/**
 * Logger utility for structured logging
 */
class Logger {
    private prefix = '[WeatherServer]';

    info(message: string, data?: unknown): void {
        console.error(`${this.prefix} [INFO] ${message}`, data ? JSON.stringify(data) : '');
    }

    error(message: string, error?: unknown): void {
        if (error instanceof Error) {
            console.error(`${this.prefix} [ERROR] ${message}`, error.message, error.stack);
        } else {
            console.error(`${this.prefix} [ERROR] ${message}`, error);
        }
    }

    warn(message: string, data?: unknown): void {
        console.error(`${this.prefix} [WARN] ${message}`, data ? JSON.stringify(data) : '');
    }
}

const logger = new Logger();

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
    try {
        if (schema) {
            schema.parse(data); // Validate the output
        }
        return createTextResponse(JSON.stringify(data, null, 2));
    } catch (error) {
        let message = 'Failed to create response';
        if (error instanceof z.ZodError) {
            message = `Output validation failed: ${error.message}`;
        }
        throw new AppError(message, 'OUTPUT_VALIDATION_ERROR');
    }
}

/**
 * Create an error response
 */
function createErrorResponse(message: string, code: string = 'ERROR'): CallToolResult {
    return createTextResponse(JSON.stringify({
        error: true,
        code,
        message,
    }, null, 2));
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
        // Register tools with error handling
        this.server.registerTool(
            'get_current_weather',
            {
                description: 'Get current weather for a specific location',
                inputSchema: GetWeatherInput,
            },
            async (args) => {
                try {
                    const validated = GetWeatherInput.parse(args);
                    return await this.getCurrentWeather(validated);
                } catch (error) {
                    return this.handleError(error, 'get_current_weather');
                }
            }
        );

        this.server.registerTool(
            'get_forecast',
            {
                description: 'Get weather forecast for multiple days',
                inputSchema: GetForecastInput,
            },
            async (args) => {
                try {
                    const validated = GetForecastInput.parse(args);
                    return await this.getForecast(validated);
                } catch (error) {
                    return this.handleError(error, 'get_forecast');
                }
            }
        );
    }

    private async getCurrentWeather(args: GetWeatherInputType): Promise<CallToolResult> {
        try {
            // Validate input
            if (!args.location || args.location.trim().length === 0) {
                throw new ValidationError('Location cannot be empty');
            }

            const locationLower = args.location.toLowerCase().trim();
            const weather = weatherData[locationLower];

            if (!weather) {
                logger.warn(`Weather data not found for location: ${args.location}`);
                return createErrorResponse(
                    `Weather data not found for "${args.location}". Try: New York, London, Tokyo, or Saigon.`,
                    'NOT_FOUND'
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

            logger.info(`Successfully retrieved weather for ${args.location}`);
            return createJsonResponse(output, WeatherOutputSchema);
        } catch (error) {
            return this.handleError(error, 'getCurrentWeather');
        }
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
        try {
            // Validate input
            if (!args.location || args.location.trim().length === 0) {
                throw new ValidationError('Location cannot be empty');
            }
            if (args.days < 1 || args.days > 7) {
                throw new ValidationError('Days must be between 1 and 7');
            }

            const locationLower = args.location.toLowerCase().trim();
            const weather = weatherData[locationLower];

            if (!weather) {
                logger.warn(`Weather data not found for location: ${args.location}`);
                return createErrorResponse(
                    `Location "${args.location}" not found.`,
                    'NOT_FOUND'
                );
            }

            // Generate mock forecast with proper typing
            const forecast = this.generateForecast(weather, args.days);

            const output: ForecastOutputType = {
                location: args.location,
                forecast,
            };

            logger.info(`Successfully retrieved forecast for ${args.location} (${args.days} days)`);
            return createJsonResponse(output, ForecastOutputSchema);
        } catch (error) {
            return this.handleError(error, 'getForecast');
        }
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

    /**
     * Handle errors from tool execution
     */
    private handleError(error: unknown, context: string): CallToolResult {
        if (error instanceof z.ZodError) {
            const message = `Validation error: ${error.message}`;
            logger.warn(message);
            return createErrorResponse(message, 'VALIDATION_ERROR');
        }

        if (error instanceof ValidationError) {
            logger.warn(`${context}: ${error.message}`);
            return createErrorResponse(error.message, error.code);
        }

        if (error instanceof NotFoundError) {
            logger.info(`${context}: ${error.message}`);
            return createErrorResponse(error.message, error.code);
        }

        if (error instanceof AppError) {
            logger.error(`${context}: ${error.message}`, error);
            return createErrorResponse(error.message, error.code);
        }

        if (error instanceof Error) {
            logger.error(`${context}: Unexpected error`, error);
            return createErrorResponse(`Internal error: ${error.message}`, 'INTERNAL_ERROR');
        }

        logger.error(`${context}: Unknown error`, error);
        return createErrorResponse('An unexpected error occurred', 'INTERNAL_ERROR');
    }

    async run() {
        try {
            logger.info('Starting Weather MCP Server');
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            logger.info('Weather MCP Server connected and running on stdio');
        } catch (error) {
            logger.error('Failed to start server', error);
            process.exit(1);
        }
    }
}

// ============================================================================
// Application Entry Point
// ============================================================================

async function main() {
    try {
        const server = new WeatherMCPServer();
        await server.run();
    } catch (error) {
        logger.error('Fatal error in main', error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Unhandled error in main:', error);
    process.exit(1);
});