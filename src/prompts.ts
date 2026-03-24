import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NotFoundError, ValidationError, SecurityError } from './errors.js';
import { logger } from './logger.js';
import { config } from './config.js';

const MAX_LOCATION_LENGTH = config.maxLocationLength;

function normalizeCity(input: string): string {
  const city = input.trim();

  if (city.length === 0) {
    throw new ValidationError('City name cannot be empty');
  }

  if (city.length > MAX_LOCATION_LENGTH) {
    throw new SecurityError(`City name length must be ${MAX_LOCATION_LENGTH} characters or less`);
  }

  if (!/^[a-zA-Z0-9\s\-']+$/.test(city)) {
    throw new SecurityError('City name contains invalid characters');
  }

  const collapsed = city.replace(/\s{2,}/g, ' ');
  return collapsed;
}

function assertCitySupported(city: string): string {
  const normalized = city.toLowerCase();
  const existing = config.supportedCities.find((known) => known.toLowerCase() === normalized);
  if (!existing) {
    throw new NotFoundError(`City '${city}'`);
  }
  return existing;
}

interface WeatherSummaryPromptArgs {
  location: string;
}

interface CompareWeatherPromptArgs {
  cities: string[];
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    'weather-summary',
    {
      title: 'Weather summary prompt',
      description: 'Generate a user-facing weather summary prompt for a supported city',
      argsSchema: {
        location: z
          .string()
          .min(1, 'Location cannot be empty')
          .max(MAX_LOCATION_LENGTH, `Location must be ${MAX_LOCATION_LENGTH} characters or less`)
          .describe(`The city to summarize weather for (${config.supportedCities.join(', ')}).`),
      },
    },
    async ({ location }: { location: string }) => {
      const city = assertCitySupported(normalizeCity(location));
      logger.info(`Generating prompt for weather-summary: ${city}`);

      const text = `Create a friendly summary of current weather conditions in ${city}. Include information about temperature, condition, humidity, and whether it is a good time for outdoor activities.`;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text,
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'compare-weather',
    {
      title: 'Compare weather cities prompt',
      description: 'Generate a prompt instructing comparing weather for multiple cities',
      argsSchema: {
        cities: z
          .array(z.string().min(1))
          .min(2, 'At least two cities must be provided')
          .max(4, 'No more than four cities may be compared'),
      },
    },
    async ({ cities }: { cities: string[] }) => {
      if (new Set(cities.map((c) => c.trim().toLowerCase())).size !== cities.length) {
        throw new ValidationError('City names must be unique');
      }

      const sanitizedCities = cities.map((city) => assertCitySupported(normalizeCity(city)));
      logger.info(`Generating prompt for compare-weather: ${sanitizedCities.join(', ')}`);

      const text = `Compare the current weather conditions in ${sanitizedCities.join(', ')}. For each city, include temperature, weather condition, humidity, and a brief recommendation about outdoor plans.`;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text,
            },
          },
        ],
      };
    }
  );
}
