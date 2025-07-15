export * from './rate-limiter.js';
export * from './audit-logger.js';
export * from './permissions.js';
export * from './input-validator.js';

// Initialize security modules
import { auditLogger } from './audit-logger.js';

// Log security module initialization
auditLogger.log({
  action: 'security_initialized',
  status: 'success',
  metadata: {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  },
}).catch(console.error);

console.log('Security modules initialized');
