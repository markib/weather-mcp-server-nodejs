// Test script to verify authentication functionality
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testAuth() {
    console.log("Testing authentication functionality...\n");

    // Test 1: Server with auth disabled (default)
    console.log("Test 1: Server with authentication disabled");
    try {
        const client1 = new Client({
            name: "auth-test-client",
            version: "1.0.0",
        });

        const transport1 = new StdioClientTransport({
            command: "tsx",
            args: ["src/server.ts"],
        });

        await client1.connect(transport1);
        const tools1 = await client1.listTools();
        console.log(`✓ Successfully connected without auth. Found ${tools1.tools.length} tools.`);

        const weatherResult = await client1.callTool({
            name: "get_current_weather",
            arguments: { location: "London" },
        });
        console.log("✓ Weather request succeeded without auth");

        await client1.close();
    } catch (error) {
        console.error("✗ Test 1 failed:", error);
    }

    console.log("\nTest 2: Server with authentication enabled but no token");
    try {
        const client2 = new Client({
            name: "auth-test-client",
            version: "1.0.0",
        });

        const transport2 = new StdioClientTransport({
            command: "tsx",
            args: ["src/server.ts"],
            env: {
                AUTH_ENABLED: "true",
                BEARER_TOKEN: "test-token-123"
            }
        });

        await client2.connect(transport2);
        const tools2 = await client2.listTools();
        console.log("✗ Should have failed but didn't - this is unexpected");
        await client2.close();
    } catch (error) {
        console.log("✓ Correctly failed without token:", (error as any).message);
    }

    console.log("\nTest 3: Server with authentication enabled and correct token");
    try {
        const client3 = new Client({
            name: "auth-test-client",
            version: "1.0.0",
        });

        const transport3 = new StdioClientTransport({
            command: "tsx",
            args: ["src/server.ts"],
            env: {
                AUTH_ENABLED: "true",
                BEARER_TOKEN: "test-token-123",
                MCP_AUTH_TOKEN: "test-token-123"
            }
        });

        await client3.connect(transport3);
        const tools3 = await client3.listTools();
        console.log(`✓ Successfully connected with auth. Found ${tools3.tools.length} tools.`);

        const weatherResult = await client3.callTool({
            name: "get_current_weather",
            arguments: { location: "London" },
        });
        console.log("✓ Weather request succeeded with auth");

        await client3.close();
    } catch (error) {
        console.error("✗ Test 3 failed:", error);
    }

    console.log("\nAuthentication tests completed!");
}

testAuth().catch(console.error);