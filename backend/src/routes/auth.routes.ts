import { Router } from 'express';
import { AuthController } from '../controllers';
import { asyncHandler, authenticate, rateLimit, validate } from '../middleware';
import { authValidation } from '../validations';

const router = Router();

/**
 * Login is throttled per IP. Everything else here needs a valid access token;
 * `/refresh` is the exception because its credential is the httpOnly cookie.
 */
router.post(
  '/login',
  rateLimit({ windowMs: 15 * 60_000, max: 10, keyPrefix: 'login' }),
  validate(authValidation.loginSchema),
  asyncHandler(AuthController.login),
);

router.post(
  '/refresh',
  rateLimit({ windowMs: 15 * 60_000, max: 60, keyPrefix: 'refresh' }),
  asyncHandler(AuthController.refresh),
);

router.post('/logout', authenticate, asyncHandler(AuthController.logout));
router.post('/logout-all', authenticate, asyncHandler(AuthController.logoutAll));
router.get('/me', authenticate, asyncHandler(AuthController.me));

router.patch(
  '/me',
  authenticate,
  validate(authValidation.updateProfileSchema),
  asyncHandler(AuthController.updateProfile),
);

router.post(
  '/change-password',
  authenticate,
  validate(authValidation.changePasswordSchema),
  asyncHandler(AuthController.changePassword),
);

export default router;
