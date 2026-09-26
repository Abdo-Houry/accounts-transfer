import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError, type FieldIssue } from '../utils/api-error';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Parses and *replaces* the request parts with the validated output, so a
 * controller only ever sees coerced, whitelisted data. Zod strips unknown keys
 * by default, which is what stops a client from smuggling extra fields into an
 * update.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: FieldIssue[] = [];

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (result.success) {
        // `req.query` has only a getter in Express 5; assigning through
        // defineProperty keeps this working on both major versions.
        Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true });
      } else {
        issues.push(...toFieldIssues(result.error, part));
      }
    }

    if (issues.length > 0) return next(ApiError.validation(issues));
    next();
  };
}

function toFieldIssues(error: ZodError, part: string): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : part,
    message: issue.message,
    code: issue.code,
  }));
}
