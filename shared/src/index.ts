/**
 * The API contract shared by backend_service and web (M0.T2).
 * Schemas validate on both sides; types are inferred from them. See docs/api.md.
 */
export * from './contract/audit-events.js';
export * from './contract/certificates.js';
export * from './contract/common.js';
export * from './contract/courses.js';
export * from './contract/endpoints.js';
export * from './contract/errors.js';
export * from './contract/health.js';
export * from './contract/issuances.js';
export * from './contract/participants.js';
export * from './contract/tenants.js';
