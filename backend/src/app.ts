import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import express, { type Express } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFoundHandler, requestContext } from './middleware';
import { logger } from './utils/logger';

export function createApp(): Express {
  const app = express();

  // Behind nginx / a load balancer, one hop is trusted so `req.ip` and the
  // secure-cookie logic see the real client rather than the proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  /**
   * When the API also serves the built UI, the default content-security policy
   * has to be widened enough for the app to actually run: Radix writes inline
   * styles, the web fonts come from Google, and the transfer receipt renders its
   * QR code as a `data:` image. Everything else stays locked to this origin.
   */
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: env.SERVE_FRONTEND
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
              imgSrc: ["'self'", 'data:', 'blob:'],
              mediaSrc: ["'self'", 'blob:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: null,
            },
          }
        : undefined,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive without an Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);

        // Deny by omitting the CORS headers rather than by throwing: the browser
        // is what must block the response, and throwing here would turn a policy
        // decision into a 500 that looks like a server fault to the operator.
        logger.warn('Blocked a cross-origin request', { origin });
        callback(null, false);
      },
      credentials: true,
      exposedHeaders: ['x-request-id', 'content-language'],
    }),
  );

  app.use(compression());
  app.use(cookieParser());
  // A 200 kB ceiling is generous for JSON operations and keeps a runaway payload
  // from occupying a worker.
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: true, limit: '200kb' }));

  app.use(requestContext);

  if (!env.isTest) {
    app.use(
      morgan(env.isProduction ? 'combined' : 'dev', {
        stream: { write: (line) => logger.info(line.trim(), { channel: 'http' }) },
        skip: (req) => req.path === `${env.API_PREFIX}/health`,
      }),
    );
  }

  app.use(env.API_PREFIX, routes);

  if (env.SERVE_FRONTEND) {
    const distPath = path.resolve(process.cwd(), env.FRONTEND_DIST);

    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      logger.warn('SERVE_FRONTEND is on but no build was found - run the frontend build first', {
        distPath,
      });
    } else {
      // Hashed asset filenames can be cached hard; index.html must not be, or a
      // deploy leaves operators on a stale bundle talking to a newer API.
      app.use(express.static(distPath, { index: false, maxAge: '30d', etag: true }));

      // SPA fallback. Anything that is not an API call and not a real file is a
      // client-side route, so it gets the shell and React resolves it.
      app.get('*', (req, res, next) => {
        if (req.path.startsWith(env.API_PREFIX)) return next();
        res.sendFile(path.join(distPath, 'index.html'), { headers: { 'Cache-Control': 'no-store' } });
      });

      logger.info('Serving the frontend build', { distPath });
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
