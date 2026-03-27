import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  GetWeatherInput,
  GetForecastInput,
  WeatherOutputSchema,
  ForecastOutputSchema,
} from './schemas.js';
import { AppError, ValidationError, NotFoundError, SecurityError } from './errors.js';
import { logger } from './logger.js';

import { config } from './config.js';

// Security configuration constants
const SECURITY_CONFIG = {
  MAX_LOCATION_LENGTH: config.maxLocationLength,
  LOCATION_PATTERN: /^[a-zA-Z0-9\s\-']+$/,
  ALLOWED_LOCATIONS: new Set(config.supportedCities.map((city) => city.toLowerCase())),
  RATE_LIMIT_WINDOW_MS: config.rateLimitWindowMs,
  MAX_REQUESTS_PER_WINDOW: config.maxRequestsPerWindow,
  MAX_FORECAST_DAYS: config.maxForecastDays,
} as const;

class RateLimiter {
  private requestTimestamps: Map<string, number[]> = new Map();

  isAllowed(toolName: string): boolean {
    const now = Date.now();
    const timestamps = this.requestTimestamps.get(toolName) ?? [];
    const recent = timestamps.filter((ts) => now - ts < SECURITY_CONFIG.RATE_LIMIT_WINDOW_MS);

    if (recent.length >= SECURITY_CONFIG.MAX_REQUESTS_PER_WINDOW) {
      logger.warn(`Rate limit exceeded for tool: ${toolName}`);
      return false;
    }

    recent.push(now);
    this.requestTimestamps.set(toolName, recent);
    return true;
  }
}

const rateLimiter = new RateLimiter();

function sanitizeLocation(input: string): string {
  const sanitized = input.trim();

  if (sanitized.length === 0) {
    throw new ValidationError('Location cannot be empty');
  }

  if (sanitized.length > SECURITY_CONFIG.MAX_LOCATION_LENGTH) {
    throw new SecurityError(`Location exceeds maximum length of ${SECURITY_CONFIG.MAX_LOCATION_LENGTH} characters`);
  }

  if (!SECURITY_CONFIG.LOCATION_PATTERN.test(sanitized)) {
    throw new SecurityError('Location contains invalid characters. Only alphanumeric characters, spaces, hyphens, and apostrophes are allowed');
  }

  if (/\s{2,}/.test(sanitized)) {
    throw new SecurityError('Location cannot contain multiple consecutive spaces');
  }

  const normalized = sanitized.toLowerCase();
  if (!SECURITY_CONFIG.ALLOWED_LOCATIONS.has(normalized)) {
    throw new NotFoundError(`Location ${sanitized} is not supported`);
  }

  return sanitized;
}

interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
}

const weatherData: Record<string, WeatherData> = {
  'new york': { temp: 18, condition: 'Partly Cloudy', humidity: 65 },
  london: { temp: 12, condition: 'Rainy', humidity: 82 },
  tokyo: { temp: 22, condition: 'Sunny', humidity: 55 },
  saigon: { temp: 32, condition: 'Hot', humidity: 78 },
};

function createTextResponse(text: string): CallToolResult {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

function createJsonResponse<T>(data: T, schema?: z.ZodSchema<T>): CallToolResult {
  try {
    if (schema) {
      schema.parse(data);
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

function createErrorResponse(message: string, code = 'ERROR'): CallToolResult {
  return createTextResponse(
    JSON.stringify({
      error: true,
      code,
      message,
    }, null, 2)
  );
}

function convertTemperature(celsius: number, target: 'celsius' | 'fahrenheit'): number {
  if (target === 'fahrenheit') {
    return Math.round((celsius * 9 / 5 + 32) * 10) / 10;
  }
  return celsius;
}

function generateForecast(base: WeatherData, days: number): Array<{ day: number; temp: string; condition: string }> {
  return Array.from({ length: days }, (_, index) => {
    const variation = ((index % 2 === 0 ? 1 : -1) * 3);
    return {
      day: index + 1,
      temp: `${base.temp + variation}°C`,
      condition: base.condition,
    };
  });
}

async function getCurrentWeatherHandler(args: unknown): Promise<CallToolResult> {
  const validated = GetWeatherInput.parse(args);

  if (!rateLimiter.isAllowed('get_current_weather')) {
    throw new SecurityError('Rate limit exceeded for get_current_weather');
  }

  const sanitizedLocation = sanitizeLocation(validated.location);
  const normalized = sanitizedLocation.toLowerCase();

  const weather = weatherData[normalized];
  if (!weather) {
    throw new NotFoundError(`Weather data for location ${sanitizedLocation}`);
  }

  const temp = convertTemperature(weather.temp, validated.units);
  const unit = validated.units === 'fahrenheit' ? '°F' : '°C';

  const output = {
    location: sanitizedLocation,
    temperature: `${temp}${unit}`,
    condition: weather.condition,
    humidity: `${weather.humidity}%`,
  };

  logger.info(`Retrieved current weather for ${sanitizedLocation}`);
  return createJsonResponse(output, WeatherOutputSchema);
}

async function getForecastHandler(args: unknown): Promise<CallToolResult> {
  const validated = GetForecastInput.parse(args);

  if (!rateLimiter.isAllowed('get_forecast')) {
    throw new SecurityError('Rate limit exceeded for get_forecast');
  }

  const sanitizedLocation = sanitizeLocation(validated.location);
  const normalized = sanitizedLocation.toLowerCase();

  const weather = weatherData[normalized];
  if (!weather) {
    throw new NotFoundError(`Weather data for location ${sanitizedLocation}`);
  }

  if (validated.days > SECURITY_CONFIG.MAX_FORECAST_DAYS) {
    throw new ValidationError(`Forecast days cannot exceed configured maximum of ${SECURITY_CONFIG.MAX_FORECAST_DAYS}`);
  }

  const forecast = generateForecast(weather, validated.days);
  const output = {
    location: sanitizedLocation,
    forecast,
  };

  logger.info(`Retrieved forecast for ${sanitizedLocation} for ${validated.days} days`);
  return createJsonResponse(output, ForecastOutputSchema);
}

export const toolDefinitions = [
  {
    name: 'get_current_weather',
    description: 'Retrieve current weather for a specified location (New York, London, Tokyo, Saigon).',
    inputSchema: GetWeatherInput,
    handler: getCurrentWeatherHandler,
  },
  {
    name: 'get_forecast',
    description: 'Retrieve a weather forecast for the next 1-7 days for a known city.',
    inputSchema: GetForecastInput,
    handler: getForecastHandler,
  },
];
