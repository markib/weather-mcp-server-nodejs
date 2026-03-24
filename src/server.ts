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

// Input schemas with comprehensive descriptions
const GetWeatherInput = z.object({
    location: z.string()
        .min(1, 'Location cannot be empty')
        .describe('City name to retrieve weather for. Examples: "London", "New York", "Tokyo", "Saigon". Case-insensitive.'),
    units: z.enum(['celsius', 'fahrenheit'])
        .describe('Temperature unit for the response. "celsius" returns temperatures in °C, "fahrenheit" returns in °F.')
        .optional()
        .default('celsius'),
});

const GetForecastInput = z.object({
    location: z.string()
        .min(1, 'Location cannot be empty')
        .describe('City name to retrieve forecast for. Examples: "London", "New York", "Tokyo", "Saigon". Case-insensitive.'),
    days: z.number()
        .int('Days must be a whole number')
        .min(1, 'Days must be at least 1')
        .max(7, 'Forecast is limited to 7 days maximum')
        .describe('Number of forecast days to return. Must be between 1 and 7. Default is 3 days.')
        .optional()
        .default(3),
});

// Output schemas for type safety with documentation
/**
 * Response format for current weather queries
 * Contains real-time weather information for a specific location
 */
const WeatherOutputSchema = z.object({
    location: z.string().describe('The city name that was queried'),
    temperature: z.string().describe('Current temperature with unit symbol (e.g., "12°C" or "64.4°F")'),
    condition: z.string().describe('Current weather condition (e.g., "Sunny", "Rainy", "Partly Cloudy")'),
    humidity: z.string().describe('Current humidity level as a percentage (e.g., "82%")'),
});

/**
 * Response format for weather forecast queries
 * Contains predicted weather information for multiple days
 */
const ForecastOutputSchema = z.object({
    location: z.string().describe('The city name that was queried'),
    forecast: z.array(z.object({
        day: z.number().describe('Day number in the forecast (1 = first day, 2 = second day, etc.)'),
        temp: z.string().describe('Predicted temperature in Celsius (e.g., "22°C")'),
        condition: z.string().describe('Expected weather condition (e.g., "Sunny", "Rainy")'),
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
        // Register tools with error handling and comprehensive descriptions
        this.server.registerTool(
            'get_current_weather',
            {
                description: `Retrieve current weather conditions for a specified location.
                
Use this tool to get real-time or near-real-time weather data including temperature, 
conditions (e.g., sunny, rainy), and humidity percentage for any supported city.

Parameters:
- location (required): The city name to get weather for (e.g., "London", "New York", "Tokyo")
- units (optional): Temperature scale - either "celsius" (default) or "fahrenheit"

Returns:
- location: The requested city name
- temperature: Current temperature with unit symbol (e.g., "12°C" or "64.4°F")
- condition: Weather condition description (e.g., "Rainy", "Sunny")
- humidity: Humidity percentage (e.g., "82%")

If the location is not found, an error response will be returned with available cities.
Supported cities: New York, London, Tokyo, Saigon`,
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
                description: `Generate a weather forecast for a location over multiple days.

Use this tool when you need to plan ahead and understand weather trends. Provides daily 
forecasts with temperature predictions and expected weather conditions.

Parameters:
- location (required): The city name to get forecast for (e.g., "London", "New York", "Tokyo")
- days (optional): Number of forecast days to return (1-7, default: 3). Must be a whole number.

Returns:
- location: The requested city name
- forecast: Array of daily forecasts, each containing:
  - day: Day number (1 = first day of forecast)
  - temp: Predicted temperature in Celsius
  - condition: Expected weather condition

Use cases:
- Planning outdoor activities or travel
- Deciding when to do time-sensitive tasks
- Coordinating schedules across multiple days
- Preparing appropriate gear or supplies

If the location is not found, an error response will be returned with available cities.
Supported cities: New York, London, Tokyo, Saigon`,
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

    /**
     * Retrieve current weather conditions for a specific location
     * 
     * This method handles the `get_current_weather` tool request. It:
     * 1. Validates the input location is not empty
     * 2. Looks up weather data for the location (case-insensitive)
     * 3. Converts temperature to the requested unit (celsius or fahrenheit)
     * 4. Returns a structured response with temperature, condition, and humidity
     * 
     * @param args - Tool arguments containing location and optional units
     * @returns CallToolResult with weather data or error information
     * @throws ValidationError if input is invalid
     */
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
     * 
     * Converts Celsius to Fahrenheit using the formula: (C × 9/5) + 32
     * Results are rounded to 1 decimal place for readability
     * 
     * @param celsius - Temperature in Celsius
     * @param target - Target unit: 'celsius' returns unchanged, 'fahrenheit' converts
     * @returns Temperature in the target unit
     */
    private convertTemperature(celsius: number, target: 'celsius' | 'fahrenheit'): number {
        if (target === 'fahrenheit') {
            return Math.round((celsius * 9 / 5 + 32) * 10) / 10;
        }
        return celsius;
    }

    /**
     * Generate a weather forecast for a location over multiple days
     * 
     * This method handles the `get_forecast` tool request. It:
     * 1. Validates input (non-empty location, valid day range 1-7)
     * 2. Looks up weather data for the location (case-insensitive)
     * 3. Generates a multi-day forecast with temperature variations
     * 4. Returns structured forecast data with day-by-day predictions
     * 
     * @param args - Tool arguments containing location and optional days count
     * @returns CallToolResult with forecast data or error information
     * @throws ValidationError if input is invalid (empty location or invalid days)
     */
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
     * Generate a daily weather forecast with temperature variations
     * 
     * Creates a realistic weather forecast by:
     * 1. Using the base weather condition from the location data
     * 2. Varying temperature by ±3°C from the base temperature
     * 3. Returning a structured array of daily predictions
     * 
     * Note: This is a mock generator. In production, use real weather APIs
     * like OpenWeatherMap, WeatherAPI, or similar services.
     * 
     * @param weather - Base weather data for the location
     * @param days - Number of days to forecast (1-7)
     * @returns Array of forecast objects with day number, temperature, and condition
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
     * Unified error handling for all tool operations
     * 
     * Processes different error types and returns appropriate responses:
     * - Zod validation errors: Returns detailed validation error messages
     * - ValidationError: Returns validation error responses with context
     * - NotFoundError: Returns not found error responses
     * - AppError: Returns application-specific errors with codes
     * - Generic Error: Returns unexpected error responses
     * - Unknown errors: Returns generic internal error response
     * 
     * All errors are logged with appropriate severity levels for debugging
     * 
     * @param error - The error object to handle
     * @param context - String describing where the error occurred (for logging)
     * @returns CallToolResult with error information structured as JSON
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

    /**
     * Start the Weather MCP Server
     * 
     * Initializes and connects the server using stdio transport:
     * 1. Creates a StdioServerTransport for command-line communication
     * 2. Connects the MCP server to the transport
     * 3. Logs success/failure status
     * 4. Exits with code 1 on fatal errors
     * 
     * The server will listen on standard input/output for MCP protocol
     * messages and respond to tool calls via the registered handlers.
     * 
     * @throws Process exit with code 1 if connection fails
     */
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

/**
 * Main entry point for the Weather MCP Server application
 * 
 * Creates a new WeatherMCPServer instance and starts it with error handling.
 * This function:
 * 1. Instantiates the WeatherMCPServer class
 * 2. Calls the run() method to start the server
 * 3. Handles any top-level errors
 * 4. Exits with appropriate status code
 * 
 * The server will expose the following tools:
 * - get_current_weather: Get real-time weather for a location
 * - get_forecast: Get multi-day weather forecast for a location
 * 
 * Usage:
 *   npm start           # Run the server
 *   npm test            # Test with the example client
 *   npm run build       # Compile TypeScript to JavaScript
 * 
 * @throws Process exit with code 1 on fatal errors
 */
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