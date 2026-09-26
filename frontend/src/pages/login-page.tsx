import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { LogIn } from 'lucide-react';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { FormField } from '@/components/common';
import { AuthShell } from '@/components/layout/app-shell';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';

const schema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(1),
});

type LoginForm = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.username, values.password);
      // Return the operator to whatever they were trying to reach.
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from ?? '/', { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiRequestError ? error.message : t('feedback.networkError'),
      );
    }
  });

  return (
    <AuthShell>
      <Card className="w-full max-w-md">
        <CardHeader className="p-6 pb-2">
          <CardTitle className="text-xl">{t('auth.signIn')}</CardTitle>
          <p className="text-sm text-[var(--text-muted)]">{t('auth.loginSubtitle')}</p>
        </CardHeader>

        <CardContent className="p-6 pt-4">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {serverError ? <Alert tone="error">{serverError}</Alert> : null}

            <FormField
              label={t('auth.username')}
              htmlFor="username"
              required
              error={errors.username ? t('validation.required') : undefined}
            >
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                dir="ltr"
                invalid={Boolean(errors.username)}
                {...register('username')}
              />
            </FormField>

            <FormField
              label={t('auth.password')}
              htmlFor="password"
              required
              error={errors.password ? t('validation.required') : undefined}
            >
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </FormField>

            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
              <LogIn />
              {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
