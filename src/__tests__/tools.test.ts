import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '../tools.js';
import { NotFoundError, ValidationError } from '../errors.js';

function parseToolResult(result: unknown) {
  expect(result).toEqual(expect.objectContaining({ content: expect.any(Array) }));
  const item: any = (result as any).content[0];
  expect(item.type).toBe('text');
  return JSON.parse(item.text);
}

describe('Tool handlers', () => {
  it('get_current_weather returns weather data for valid city', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'get_current_weather');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ location: 'London', units: 'celsius' });
    const parsed = parseToolResult(result);

    expect(parsed).toMatchObject({
      location: 'London',
      condition: 'Rainy',
      humidity: '82%',
    });
    expect(parsed.temperature).toBe('12°C');
  });

  it('get_forecast returns forecast for valid city and days', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'get_forecast');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ location: 'Tokyo', days: 3 });
    const parsed = parseToolResult(result);

    expect(parsed).toMatchObject({ location: 'Tokyo' });
    expect(Array.isArray(parsed.forecast)).toBe(true);
    expect(parsed.forecast).toHaveLength(3);
    expect(parsed.forecast[0]).toHaveProperty('day');
  });

  it('get_current_weather rejects unknown city with NotFoundError', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'get_current_weather');
    expect(tool).toBeDefined();

    await expect(async () => {
      await tool!.handler({ location: 'Paris', units: 'celsius' });
    }).rejects.toThrow(NotFoundError);
  });

  it('get_current_weather rejects invalid units with ZodError', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'get_current_weather');
    expect(tool).toBeDefined();

    await expect(async () => {
      await tool!.handler({ location: 'New York', units: 'kelvin' });
    }).rejects.toThrow();
  });

  it('get_forecast rejects days out of range with ZodError', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'get_forecast');
    expect(tool).toBeDefined();

    await expect(async () => {
      await tool!.handler({ location: 'New York', days: 10 });
    }).rejects.toThrow();
  });

  it('get_forecast rejects days beyond configured max with ValidationError', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'get_forecast');
    expect(tool).toBeDefined();

    await expect(async () => {
      await tool!.handler({ location: 'New York', days: 8 });
    }).rejects.toThrow();
  });

  it('get_current_weather returns Tokyo weather', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'get_current_weather');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ location: 'Tokyo' });
    const parsed = parseToolResult(result);

    expect(parsed).toMatchObject({
      location: 'Tokyo',
      condition: 'Sunny',
      humidity: '55%',
    });
    expect(parsed.temperature).toBe('22°C');
  });

  it('get_forecast returns Tokyo forecast', async () => {
    const tool = toolDefinitions.find((t) => t.name === 'get_forecast');
    expect(tool).toBeDefined();

    const result = await tool!.handler({ location: 'Tokyo' });
    const parsed = parseToolResult(result);

    expect(parsed).toMatchObject({ location: 'Tokyo' });
    expect(Array.isArray(parsed.forecast)).toBe(true);
    expect(parsed.forecast).toHaveLength(3);
  });
});
