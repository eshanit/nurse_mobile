/**
 * AI Authentication Middleware
 *
 * Validates requests to AI endpoints have proper authorization
 */

export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  
  // Skip auth in development if token is default
  if (process.env.NODE_ENV === 'development' && config.aiAuthToken === 'local-dev-token') {
    return;
  }
  
  const token = getHeader(event, 'x-ai-token');

  if (token !== config.aiAuthToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized AI access'
    });
  }
});
