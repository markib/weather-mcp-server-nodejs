import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { toolDefinitions } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { AppError, ValidationError, NotFoundError, SecurityError, AuthError } from "./errors.js";
import { logger } from "./logger.js";
import { authenticateRequest } from "./auth.js";

// Note: Tool handlers are in src/tools.ts (includes validation + operations)
// Server is responsible for registering these tools with MCP.




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

        registerResources(this.server);
        registerPrompts(this.server);
        this.setupHandlers();
    }

    private setupHandlers() {
        // Register list-tools request handler
        this.server.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            try {
                authenticateRequest();
                return {
                    tools: toolDefinitions.map((tool) => ({
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                    })),
                };
            } catch (error) {
                return this.handleError(error, 'list-tools');
            }
        });

        // Register call-tool request handler
        this.server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            let toolName = 'unknown-tool';
            try {
                authenticateRequest();
                const tool = toolDefinitions.find((t) => t.name === request.params.name);

                if (!tool) {
                    return createErrorResponse(`Tool ${request.params.name} not found`, 'NOT_FOUND');
                }

                toolName = tool.name;
                const args = (request.params.arguments ?? {}) as Record<string, unknown>;

                // Support tool-specific metadata fallback for location if not in arguments
                if (!args.location && typeof request.params._meta?.location === 'string') {
                    args.location = request.params._meta.location;
                }

                const result = await tool.handler(args);
                return result;
            } catch (error) {
                return this.handleError(error, toolName);
            }
        });
    }

    // Tool implementations are now handled in src/tools.ts using toolDefinitions.
    // This class only registers tool callbacks and handles errors.

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

        if (error instanceof AuthError) {
            logger.warn(`${context}: ${error.message}`);
            return createErrorResponse(error.message, error.code);
        }

        if (error instanceof SecurityError) {
            logger.warn(`${context}: Security violation - ${error.message}`);
            return createErrorResponse(error.message, error.code);
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

    async shutdown() {
        logger.info('Shutdown initiated for Weather MCP Server');
        try {
            if (this.server.isConnected()) {
                await this.server.close();
                logger.info('Weather MCP Server shutdown complete');
            } else {
                logger.info('Weather MCP Server was not connected; no close required');
            }
        } catch (error) {
            logger.error('Error during Weather MCP Server shutdown', error);
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
function setupShutdownHandlers(server: WeatherMCPServer) {
    let isShuttingDown = false;

    async function shutdown(code: number, reason: string) {
        if (isShuttingDown) {
            return;
        }
        isShuttingDown = true;

        logger.info(`${reason} received, starting graceful shutdown`);

        await server.shutdown();

        logger.info('Graceful shutdown complete');
        process.exit(code);
    }

    process.once('SIGINT', () => shutdown(0, 'SIGINT'));
    process.once('SIGTERM', () => shutdown(0, 'SIGTERM'));

    // Windows-specific shutdown signal support
    if (process.platform === 'win32') {
      process.once('SIGBREAK', () => shutdown(0, 'SIGBREAK'));
    }

    process.on('uncaughtException', async (error: Error) => {
        logger.error('Uncaught exception caught', error);
        await shutdown(1, 'uncaughtException');
    });

    process.on('unhandledRejection', async (reason: unknown) => {
        logger.error('Unhandled promise rejection', reason);
        await shutdown(1, 'unhandledRejection');
    });
}

async function main() {
    try {
        const server = new WeatherMCPServer();
        setupShutdownHandlers(server);
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