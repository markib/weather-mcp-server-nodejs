import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testWeatherServer() {
    console.log("Starting Weather MCP Server...\n");

    try {
        // Create a client and connect via stdio
        const client = new Client({
            name: "weather-test-client",
            version: "1.0.0",
        });

        const transport = new StdioClientTransport({
            command: "tsx",
            args: ["src/server.ts"],
        });

        await client.connect(transport);
        console.log("✓ Connected to Weather MCP Server\n");

        // List available tools
        console.log("Listing available tools...");
        const tools = await client.listTools();
        console.log(`Found ${tools.tools.length} tools:`);
        tools.tools.forEach((tool) => {
            console.log(`  - ${tool.name}: ${tool.description}`);
        });
        console.log();

        // Test get_current_weather
        console.log("Testing: get_current_weather for London");
        const weatherResult = await client.callTool({
            name: "get_current_weather",
            arguments: {
                location: "London",
                units: "celsius",
            },
        });
        console.log("Result:", (weatherResult.content as any)[0]);
        console.log();

        // Test get_current_weather with Fahrenheit
        console.log("Testing: get_current_weather for New York (Fahrenheit)");
        const weatherFahrenheit = await client.callTool({
            name: "get_current_weather",
            arguments: {
                location: "New York",
                units: "fahrenheit",
            },
        });
        console.log("Result:", (weatherFahrenheit.content as any)[0]);
        console.log();

        // Test get_forecast
        console.log("Testing: get_forecast for Tokyo (5 days)");
        const forecastResult = await client.callTool({
            name: "get_forecast",
            arguments: {
                location: "Tokyo",
                days: 5,
            },
        });
        console.log("Result:", (forecastResult.content as any)[0]);
        console.log();

        // Test with invalid location
        console.log("Testing: get_current_weather with invalid location (Paris)");
        const invalidResult = await client.callTool({
            name: "get_current_weather",
            arguments: {
                location: "Paris",
            },
        });
        console.log("Result:", (invalidResult.content as any)[0]);
        console.log();

        console.log("✓ All tests completed successfully!");
        await client.close();
    } catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
}

testWeatherServer().catch(console.error);

