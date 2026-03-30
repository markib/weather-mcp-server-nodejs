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
function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    // Adding ! after the brackets tells TS these won't be undefined
    result |= (bufA[i]! ^ bufB[i]!) & 0xFF;
  }
  return result === 0;
}

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

  if (!constantTimeCompare(token, config.bearerToken)) {
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