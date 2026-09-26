import type { Request } from 'express';
import type { AuditLog } from '../entities/audit-log.entity';
import type { FinancialTransaction } from '../entities/financial-transaction.entity';
import type { LedgerEntry } from '../entities/ledger-entry.entity';
import { Language } from '../types/enums';
import { t, type MessageParams } from './i18n';

/** Any row carrying both the written text and its translatable form. */
export interface Describable {
  description: string;
  descriptionKey?: string | null;
  descriptionParams?: Record<string, string | number> | null;
}

/** The language the current reader asked for, resolved by the context middleware. */
export function readerLanguage(req: Request): Language {
  return (req.language as Language) ?? Language.AR;
}

/**
 * Renders a stored description in the reader's language.
 *
 * Rows written before the key existed - and free text an operator typed
 * themselves, which is nobody's to translate - carry no key, and their original
 * wording is what comes back. The journal is append-only (invariant I3), so
 * this is deliberately a read-time choice: nothing rewrites text that was
 * committed alongside the money.
 */
export function describe(language: Language, row: Describable): string {
  if (!row.descriptionKey) return row.description;
  return t(
    language,
    row.descriptionKey,
    (row.descriptionParams ?? undefined) as MessageParams | undefined,
  );
}

/**
 * Replaces `description` with the rendered sentence and drops the key/params.
 *
 * The client is handed one readable string and never has to know the catalogue
 * exists, which also keeps the wire format unchanged for existing screens.
 */
function render<T extends Describable>(language: Language, row: T): T {
  const clone = { ...row } as T & { descriptionKey?: unknown; descriptionParams?: unknown };
  clone.description = describe(language, row);
  delete clone.descriptionKey;
  delete clone.descriptionParams;
  return clone as T;
}

export function localiseEntry(language: Language, entry: LedgerEntry): LedgerEntry {
  const rendered = render(language, entry);
  // A statement row is usually read through its entry, but the header sentence
  // travels with it and has to be translated on the same pass.
  if (rendered.transaction) {
    rendered.transaction = render(language, rendered.transaction);
  }
  return rendered;
}

export function localiseTransaction(
  language: Language,
  transaction: FinancialTransaction,
): FinancialTransaction {
  const rendered = render(language, transaction);
  if (rendered.entries) {
    rendered.entries = rendered.entries.map((entry) => render(language, entry));
  }
  return rendered;
}

/**
 * An audit row in the reader's language.
 *
 * The stored `action` and `entityType` stay exactly as written - they are the
 * searchable, machine-stable identifiers, and the trail would stop being
 * greppable if they moved. Readable labels are added beside them instead, so
 * the screen can show "تسليم حوالة" while a filter still matches
 * `transfer.receive`.
 */
export function localiseAuditLog(
  language: Language,
  log: AuditLog,
): AuditLog & { actionLabel: string; entityLabel: string | null } {
  const rendered = render(language, log);
  return {
    ...rendered,
    actionLabel: t(language, 'action.' + log.action),
    entityLabel: log.entityType ? t(language, 'entity.' + toEntityKey(log.entityType)) : null,
  };
}

/**
 * `cash_box` -> `CashBox`. Services record the entity type in snake_case while
 * the catalogue is keyed by the entity's class name.
 */
function toEntityKey(entityType: string): string {
  return entityType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
