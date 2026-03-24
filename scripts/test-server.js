import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
async function main() {
    const client = new Client({
        name: 'weather-mcp-integration-test',
        version: '1.0.0',
    });
    const transport = new StdioClientTransport({
        command: 'tsx',
        args: ['src/server.ts'],
        stderr: 'pipe',
    });
    transport.stderr?.on('data', (chunk) => {
        process.stderr.write(`[server stderr] ${chunk.toString()}`);
    });
    let shutdownCalled = false;
    const shutdown = async () => {
        if (shutdownCalled)
            return;
        shutdownCalled = true;
        try {
            await client.close();
        }
        catch (err) {
            console.warn('client.close() failed', err);
        }
        try {
            await transport.close();
        }
        catch (err) {
            console.warn('transport.close() failed', err);
        }
    };
    process.once('SIGINT', async () => {
        console.log('SIGINT captured');
        await shutdown();
        process.exit(0);
    });
    process.once('SIGTERM', async () => {
        console.log('SIGTERM captured');
        await shutdown();
        process.exit(0);
    });
    try {
        await client.connect(transport);
        console.log('Connected to server');
        const tools = await client.listTools();
        if (!tools.tools.some((tool) => tool.name === 'get_current_weather')) {
            throw new Error('get_current_weather missing from tool list');
        }
        console.log('Calling get_current_weather (London)');
        const currentWeather = await client.callTool({
            name: 'get_current_weather',
            arguments: { location: 'London', units: 'celsius' },
        });
        const currentText = currentWeather.content[0];
        if (!currentText || currentText.type !== 'text') {
            throw new Error('get_current_weather response shape is wrong');
        }
        console.log('Current weather response:', currentText.text);
        console.log('Calling get_forecast (Tokyo, 3 days)');
        const forecast = await client.callTool({
            name: 'get_forecast',
            arguments: { location: 'Tokyo', days: 3 },
        });
        const forecastText = forecast.content[0];
        if (!forecastText || forecastText.type !== 'text') {
            throw new Error('get_forecast response shape is wrong');
        }
        console.log('Forecast response:', forecastText.text);
        console.log('Integration test succeeded');
    }
    catch (error) {
        console.error('Integration test failed', error);
        process.exitCode = 1;
    }
    finally {
        await shutdown();
    }
}
main().catch((error) => {
    console.error('Uncaught integration test error:', error);
    process.exit(1);
});
//# sourceMappingURL=test-server.js.map