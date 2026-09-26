/**
 * Exact decimal arithmetic for money.
 *
 * IEEE-754 doubles cannot represent 0.1, so they are forbidden anywhere near a
 * balance. Every amount is carried as a *string* across layers and manipulated
 * here as a scaled `bigint` with `SCALE` fractional digits, which matches the
 * `numeric(30,10)` columns exactly.
 */

/** Number of fractional digits kept internally. Mirrors numeric(30,10). */
export const SCALE = 10;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

export type MoneyInput = string | number | bigint | Money;

const DECIMAL_RE = /^-?(?:\d+)(?:\.\d+)?$/;

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const quotient = a / b;
  const remainder = a % b;
  // half-up on the absolute value, so -0.5 -> -1 and 0.5 -> 1 (symmetric)
  const rounded = remainder * 2n >= b ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * An immutable decimal amount. All arithmetic is exact; only explicit
 * `round()` / `mul()` / `div()` can lose precision, and they round half-up.
 */
export class Money {
  private constructor(private readonly raw: bigint) {}

  // ---------------------------------------------------------------- factories

  static readonly ZERO = new Money(0n);

  static from(value: MoneyInput): Money {
    if (value instanceof Money) return value;
    if (typeof value === 'bigint') return new Money(value * SCALE_FACTOR);
    const text = typeof value === 'number' ? numberToDecimalString(value) : String(value).trim();
    if (!DECIMAL_RE.test(text)) {
      throw new Error(`Invalid decimal value: "${text}"`);
    }
    const negative = text.startsWith('-');
    const unsigned = negative ? text.slice(1) : text;
    const [intPart, fracPart = ''] = unsigned.split('.');
    const fracPadded = (fracPart + '0'.repeat(SCALE)).slice(0, SCALE);
    // digits beyond SCALE are truncated deliberately: a caller that needs them
    // rounded should round before handing the value over.
    const magnitude = BigInt(intPart + fracPadded);
    return new Money(negative ? -magnitude : magnitude);
  }

  /** Rebuilds a Money from its internal scaled representation. */
  static fromRaw(raw: bigint): Money {
    return new Money(raw);
  }

  static sum(values: MoneyInput[]): Money {
    return values.reduce<Money>((acc, v) => acc.add(v), Money.ZERO);
  }

  /** `true` when the text is a well-formed decimal this class can parse. */
  static isValid(value: unknown): boolean {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    const text = typeof value === 'number' ? numberToDecimalString(value) : value.trim();
    return DECIMAL_RE.test(text);
  }

  // --------------------------------------------------------------- arithmetic

  add(other: MoneyInput): Money {
    return new Money(this.raw + Money.from(other).raw);
  }

  sub(other: MoneyInput): Money {
    return new Money(this.raw - Money.from(other).raw);
  }

  /** Multiplication by another decimal (e.g. an exchange rate). */
  mul(other: MoneyInput): Money {
    return new Money(divRoundHalfUp(this.raw * Money.from(other).raw, SCALE_FACTOR));
  }

  div(other: MoneyInput): Money {
    const divisor = Money.from(other);
    if (divisor.isZero()) throw new Error('Division by zero');
    return new Money(divRoundHalfUp(this.raw * SCALE_FACTOR, divisor.raw));
  }

  /** Percentage helper: `Money.from('1000').percent('1.5')` -> 15. */
  percent(rate: MoneyInput): Money {
    return this.mul(rate).div('100');
  }

  negated(): Money {
    return new Money(-this.raw);
  }

  abs(): Money {
    return this.raw < 0n ? new Money(-this.raw) : this;
  }

  /** Rounds half-up to `decimals` fractional digits. */
  round(decimals: number): Money {
    if (decimals < 0 || decimals > SCALE) {
      throw new Error(`decimals must be between 0 and ${SCALE}`);
    }
    const factor = 10n ** BigInt(SCALE - decimals);
    return new Money(divRoundHalfUp(this.raw, factor) * factor);
  }

  clamp(min: MoneyInput | null, max: MoneyInput | null): Money {
    let result: Money = this;
    if (min !== null && result.lt(min)) result = Money.from(min);
    if (max !== null && result.gt(max)) result = Money.from(max);
    return result;
  }

  // --------------------------------------------------------------- comparison

  compare(other: MoneyInput): -1 | 0 | 1 {
    const b = Money.from(other).raw;
    return this.raw < b ? -1 : this.raw > b ? 1 : 0;
  }

  eq(other: MoneyInput): boolean {
    return this.compare(other) === 0;
  }
  lt(other: MoneyInput): boolean {
    return this.compare(other) < 0;
  }
  lte(other: MoneyInput): boolean {
    return this.compare(other) <= 0;
  }
  gt(other: MoneyInput): boolean {
    return this.compare(other) > 0;
  }
  gte(other: MoneyInput): boolean {
    return this.compare(other) >= 0;
  }

  isZero(): boolean {
    return this.raw === 0n;
  }
  isPositive(): boolean {
    return this.raw > 0n;
  }
  isNegative(): boolean {
    return this.raw < 0n;
  }

  // ------------------------------------------------------------------ output

  /** Internal scaled representation. Only persistence layers should need this. */
  toRaw(): bigint {
    return this.raw;
  }

  /** Canonical `numeric(30,10)` text - what goes into Postgres. */
  toString(): string {
    const negative = this.raw < 0n;
    const magnitude = (negative ? -this.raw : this.raw).toString().padStart(SCALE + 1, '0');
    const intPart = magnitude.slice(0, magnitude.length - SCALE);
    const fracPart = magnitude.slice(magnitude.length - SCALE);
    return `${negative ? '-' : ''}${intPart}.${fracPart}`;
  }

  /** Trimmed text: `1000.0000000000` -> `1000`, `1.5000000000` -> `1.5`. */
  toTrimmed(): string {
    return this.toString().replace(/\.?0+$/, '') || '0';
  }

  /** Fixed-precision text for a currency, e.g. `toFixed(2)` -> `1000.00`. */
  toFixed(decimals: number): string {
    const rounded = this.round(decimals).toString();
    if (decimals === 0) return rounded.split('.')[0];
    const [intPart, fracPart] = rounded.split('.');
    return `${intPart}.${fracPart.slice(0, decimals)}`;
  }

  toJSON(): string {
    return this.toString();
  }

  /**
   * Lossy. Only for charts and aggregates that are already display-only -
   * never feed the result back into a balance.
   */
  toNumber(): number {
    return Number(this.toString());
  }
}

function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric value: ${value}`);
  // toFixed keeps us away from exponent notation for realistic money magnitudes
  return Math.abs(value) < 1e21 ? value.toFixed(SCALE) : String(value);
}

/** Shorthand used throughout the services. */
export const money = (value: MoneyInput): Money => Money.from(value);

/**
 * TypeORM column transformer: keeps `numeric` columns as canonical strings in
 * JS instead of letting the pg driver hand back a lossy `number`.
 */
export const decimalTransformer = {
  to: (value: MoneyInput | null | undefined): string | null =>
    value === null || value === undefined ? null : Money.from(value).toString(),
  from: (value: string | null): string | null =>
    value === null || value === undefined ? null : Money.from(value).toString(),
};
