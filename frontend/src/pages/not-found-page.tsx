import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { EmptyState } from '@/components/common';
import { useI18n } from '@/context/i18n-context';

export default function NotFoundPage() {
  const { t } = useI18n();

  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={<Compass className="size-5" />}
        title="404"
        description={t('feedback.notFoundPage')}
        action={
          <Button asChild>
            <Link to="/">{t('feedback.goHome')}</Link>
          </Button>
        }
      />
    </Card>
  );
}
