import type { MessageParams } from './i18n';

/**
 * Stable, machine-readable error codes. The frontend switches on these; the
 * human sentence is produced from the i18n key at the response boundary.
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',
  TRANSFER_ALREADY_RECEIVED = 'TRANSFER_ALREADY_RECEIVED',
  RATE_NOT_AVAILABLE = 'RATE_NOT_AVAILABLE',
  UNBALANCED_TRANSACTION = 'UNBALANCED_TRANSACTION',
  IMMUTABLE_RECORD = 'IMMUTABLE_RECORD',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface FieldIssue {
  path: string;
  message: string;
  code?: string;
}

/**
 * The only error type services throw for expected failures. It carries an i18n
 * key plus params rather than a rendered sentence, so the same failure reads
 * correctly in Arabic, English and Turkish.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly params?: MessageParams;
  readonly details?: FieldIssue[];
  /** `true` for expected business failures; a bug throws something else. */
  readonly isOperational = true;

  constructor(
    statusCode: number,
    code: ErrorCode,
    messageKey: string,
    params?: MessageParams,
    details?: FieldIssue[],
  ) {
    super(code + ': ' + messageKey);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.messageKey = messageKey;
    this.params = params;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(messageKey = 'error.badRequest', params?: MessageParams): ApiError {
    return new ApiError(400, ErrorCode.BAD_REQUEST, messageKey, params);
  }

  static validation(details: FieldIssue[], messageKey = 'error.validation'): ApiError {
    return new ApiError(422, ErrorCode.VALIDATION_ERROR, messageKey, undefined, details);
  }

  static unauthenticated(messageKey = 'auth.unauthenticated', params?: MessageParams): ApiError {
    return new ApiError(401, ErrorCode.UNAUTHENTICATED, messageKey, params);
  }

  static invalidCredentials(): ApiError {
    return new ApiError(401, ErrorCode.INVALID_CREDENTIALS, 'auth.invalidCredentials');
  }

  static forbidden(permission: string): ApiError {
    return new ApiError(403, ErrorCode.FORBIDDEN, 'auth.forbidden', { permission });
  }

  static notFound(messageKey = 'error.notFound', params?: MessageParams): ApiError {
    return new ApiError(404, ErrorCode.NOT_FOUND, messageKey, params);
  }

  static conflict(messageKey = 'error.conflict', params?: MessageParams): ApiError {
    return new ApiError(409, ErrorCode.CONFLICT, messageKey, params);
  }

  static insufficientFunds(params: MessageParams): ApiError {
    return new ApiError(409, ErrorCode.INSUFFICIENT_FUNDS, 'cashbox.insufficientFunds', params);
  }

  static invalidTransition(params: MessageParams): ApiError {
    return new ApiError(409, ErrorCode.INVALID_STATUS_TRANSITION, 'transfer.invalidTransition', params);
  }

  static alreadyReceived(params: MessageParams): ApiError {
    return new ApiError(409, ErrorCode.TRANSFER_ALREADY_RECEIVED, 'transfer.alreadyReceived', params);
  }

  static rateNotAvailable(code: string): ApiError {
    return new ApiError(409, ErrorCode.RATE_NOT_AVAILABLE, 'rate.notFound', { code });
  }

  static immutable(messageKey = 'ledger.immutable', params?: MessageParams): ApiError {
    return new ApiError(409, ErrorCode.IMMUTABLE_RECORD, messageKey, params);
  }

  /**
   * Guard for invariant I1. Reaching this means a service built an unbalanced
   * journal entry: the transaction rolls back and the incident is logged loudly.
   */
  static unbalanced(params: MessageParams): ApiError {
    return new ApiError(500, ErrorCode.UNBALANCED_TRANSACTION, 'ledger.unbalanced', params);
  }

  static tooManyRequests(): ApiError {
    return new ApiError(429, ErrorCode.TOO_MANY_REQUESTS, 'error.tooManyRequests');
  }

  static internal(messageKey = 'error.internal', params?: MessageParams): ApiError {
    return new ApiError(500, ErrorCode.INTERNAL_ERROR, messageKey, params);
  }
}
