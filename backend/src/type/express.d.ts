import type { RequestContext } from '../types/common';

declare global {
  namespace Express {
    interface Request {
      /** Populated by `authenticate`; present on every protected route. */
      context?: RequestContext;
      /** Resolved by `languageResolver` on every request, protected or not. */
      language: 'ar' | 'en' | 'tr';
      /** Correlation id echoed in the response headers and the audit log. */
      requestId: string;
    }
  }
}

export {};
