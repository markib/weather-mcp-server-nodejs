import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { logger } from './logger.js';

const RawConfigSchema = z.object({
  serverName: z.string().optional(),
  version: z.string().optional(),
  supportedCities: z.array(z.string().min(1)).optional(),
  maxForecastDays: z.number().int().min(1).optional(),
  maxLocationLength: z.number().int().min(1).optional(),
  rateLimitWindowMs: z.number().int().min(1).optional(),
  maxRequestsPerWindow: z.number().int().min(1).optional(),
  authEnabled: z.boolean().optional(),
  bearerToken: z.string().nullable().optional(),
});

export const ConfigSchema = RawConfigSchema.extend({
  serverName: z.string().default('weather-mcp-server'),
  version: z.string().default('1.0.0'),
  supportedCities: z
    .array(z.string().min(1))
    .default(['New York', 'London', 'Tokyo', 'Saigon']),
  maxForecastDays: z.number().int().min(1).default(7),
  maxLocationLength: z.number().int().min(1).default(100),
  rateLimitWindowMs: z.number().int().min(1).default(1000),
  maxRequestsPerWindow: z.number().int().min(1).default(100),
  authEnabled: z.boolean().default(false),
  bearerToken: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type RawConfig = z.infer<typeof RawConfigSchema>;

function loadFileConfig(): Partial<RawConfig> {
  const configPath = process.env.CONFIG_PATH || path.resolve('config.json');

  if (!fs.existsSync(configPath)) {
    return {};
  }

  let raw = '';
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return RawConfigSchema.parse(parsed);
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error}`);
  }
}

function parseEnvValue<T>(value: string | undefined, parser: (raw: string) => T): T | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  try {
    return parser(value);
  } catch {
    throw new Error(`Invalid environment value for config: ${value}`);
  }
}

const fileConfig = loadFileConfig();

const envConfig: Partial<RawConfig> = {
  serverName: process.env.SERVER_NAME,
  version: process.env.SERVER_VERSION,
  supportedCities: process.env.SUPPORTED_CITIES
    ? process.env.SUPPORTED_CITIES.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined,
  maxForecastDays: parseEnvValue(process.env.MAX_FORECAST_DAYS, Number),
  maxLocationLength: parseEnvValue(process.env.MAX_LOCATION_LENGTH, Number),
  rateLimitWindowMs: parseEnvValue(process.env.RATE_LIMIT_WINDOW_MS, Number),
  maxRequestsPerWindow: parseEnvValue(process.env.MAX_REQUESTS_PER_WINDOW, Number),
  authEnabled: parseEnvValue(process.env.AUTH_ENABLED, (s) => s.toLowerCase() === 'true'),
  bearerToken: process.env.BEARER_TOKEN,
};

export const config = ConfigSchema.parse({
  ...fileConfig,
  ...envConfig,
});

if (config.authEnabled && !config.bearerToken) {
  throw new Error('Configuration error: authEnabled is true but bearerToken is not set');
}

logger.info('Configuration loaded', {
  serverName: config.serverName,
  version: config.version,
  supportedCities: config.supportedCities,
  maxForecastDays: config.maxForecastDays,
  maxLocationLength: config.maxLocationLength,
  rateLimitWindowMs: config.rateLimitWindowMs,
  maxRequestsPerWindow: config.maxRequestsPerWindow,
});
