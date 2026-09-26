/** Shared client-side constants. */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const ACCESS_TOKEN_STORAGE_KEY = 'rms.accessToken';
export const LANGUAGE_STORAGE_KEY = 'rms.language';

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Brand palette, mirroring the CSS tokens in app/globals.css. */
export const BRAND = {
  green: '#06332e',
  gold: '#b9aa7c',
  black: '#000000',
  white: '#ffffff',
} as const;
