import { AuthError } from './errors.js';
import { config } from './config.js';

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !parts[0] || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] || null;
}

/**
 * Validate Bearer token against configured token
 */
export function validateBearerToken(token: string | null): void {
  if (!config.authEnabled) {
    return; // Auth is disabled
  }

  if (!config.bearerToken) {
    throw new AuthError('Authentication is enabled but no bearer token is configured');
  }

  if (!token) {
    throw new AuthError('Bearer token required');
  }

  if (token !== config.bearerToken) {
    throw new AuthError('Invalid bearer token');
  }
}

/**
 * Authentication middleware for MCP requests
 * Note: MCP uses stdio transport, so auth headers need to be passed differently
 * This implementation assumes auth token is passed via environment variable or
 * through a custom header mechanism in the MCP protocol
 */
export function authenticateRequest(authToken?: string): void {
  const token = authToken || process.env.MCP_AUTH_TOKEN;
  validateBearerToken(token || null);
}