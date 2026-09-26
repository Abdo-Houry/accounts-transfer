import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@/components/ui';
import { FormField } from './index';
import { useI18n } from '@/context/i18n-context';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  /**
   * When set, the dialog collects a mandatory free-text reason and hands it to
   * `onConfirm`. Used for cancellations, reversals and voids - operations that
   * must never happen without a recorded justification.
   */
  reasonLabel?: string;
  reasonRequired?: boolean;
  onConfirm: (reason?: string) => void | Promise<void>;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  loading = false,
  reasonLabel,
  reasonRequired = true,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  /*
   * Clear on the way *in*, not only on the way out.
   *
   * The dialog is usually closed by the parent flipping `open` after a
   * successful write, which never runs `handleOpenChange` - so the previous
   * justification was still sitting in the box the next time it opened, ready
   * to be submitted against a different record.
   */
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const needsReason = Boolean(reasonLabel) && reasonRequired;
  const reasonMissing = needsReason && reason.trim().length < 3;

  const handleConfirm = async () => {
    setTouched(true);
    if (reasonMissing) return;
    await onConfirm(reasonLabel ? reason.trim() : undefined);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReason('');
      setTouched(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {children}

        {reasonLabel ? (
          <FormField
            label={reasonLabel}
            required={reasonRequired}
            error={touched && reasonMissing ? t('validation.required') : undefined}
          >
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              invalid={touched && reasonMissing}
              rows={3}
            />
          </FormField>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={handleConfirm}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small helper that wires the open/close state for a one-off confirmation. */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, ask: () => setOpen(true), close: () => setOpen(false) };
}
