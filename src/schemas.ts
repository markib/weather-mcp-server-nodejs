import { z } from 'zod';

// Security-safe defaults and constraints for tool inputs
const MAX_LOCATION_LENGTH = 100;

export const GetWeatherInput = z.object({
  location: z
    .string()
    .min(1, 'Location cannot be empty')
    .max(MAX_LOCATION_LENGTH, `Location must be ${MAX_LOCATION_LENGTH} characters or less`)
    .describe('City name to retrieve weather for. Examples: "London", "New York", "Tokyo", "Saigon". Case-insensitive.'),
  units: z
    .enum(['celsius', 'fahrenheit'])
    .optional()
    .default('celsius')
    .describe('Temperature unit for the response. "celsius" returns temperatures in °C, "fahrenheit" returns in °F.'),
});

export type GetWeatherInputType = z.infer<typeof GetWeatherInput>;

export const GetForecastInput = z.object({
  location: z
    .string()
    .min(1, 'Location cannot be empty')
    .max(MAX_LOCATION_LENGTH, `Location must be ${MAX_LOCATION_LENGTH} characters or less`)
    .describe('City name to retrieve forecast for. Examples: "London", "New York", "Tokyo", "Saigon". Case-insensitive.'),
  days: z
    .number()
    .int('Days must be a whole number')
    .min(1, 'Days must be at least 1')
    .max(7, 'Forecast is limited to 7 days maximum')
    .optional()
    .default(3)
    .describe('Number of forecast days to return. Must be between 1 and 7. Default is 3 days.'),
});

export type GetForecastInputType = z.infer<typeof GetForecastInput>;

export const WeatherOutputSchema = z.object({
  location: z.string().describe('City name returned in response'),
  temperature: z.string().describe('Current temperature as formatted string, e.g., "12°C" or "64.4°F"'),
  condition: z.string().describe('Weather condition description, e.g., "Sunny", "Rainy"'),
  humidity: z.string().describe('Humidity percentage as formatted string, e.g., "82%"'),
});

export type WeatherOutputType = z.infer<typeof WeatherOutputSchema>;

export const ForecastOutputSchema = z.object({
  location: z.string().describe('City name returned in response'),
  forecast: z
    .array(
      z.object({
        day: z.number().int().describe('Day index in forecast (1..N)'),
        temp: z.string().describe('Predicted temperature as formatted string, e.g., "24°C"'),
        condition: z.string().describe('Expected weather condition for that day'),
      })
    )
    .describe('Array of forecast objects, each representing one day'),
});

export type ForecastOutputType = z.infer<typeof ForecastOutputSchema>;
