import QRCode from 'qrcode';
import { logger } from './logger';

/**
 * QR payload for a printed transfer receipt.
 *
 * Only the document number and the figures a counter clerk needs to verify the
 * paper against the system - no customer phone numbers or identity data, since
 * a printed slip travels with the customer and may be photographed by anyone.
 */
export interface ReceiptQrPayload {
  no: string;
  amount: string;
  currency: string;
  payout: string;
  payoutCurrency: string;
  date: string;
}

export async function buildQrDataUrl(payload: ReceiptQrPayload): Promise<string | null> {
  try {
    return await QRCode.toDataURL(JSON.stringify(payload), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    });
  } catch (error) {
    // A missing QR must never block handing the customer their receipt.
    logger.warn('Failed to render receipt QR code', { no: payload.no, error });
    return null;
  }
}
