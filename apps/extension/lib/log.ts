import { configureLogging, createLogger, isLogLevel } from '@rethink/shared';

// WXT_LOG_LEVEL=debug|info|warn|error|silent in apps/extension/.env; default debug in dev builds, info otherwise.
const env = import.meta.env as Record<string, string | boolean | undefined>;
const envLevel = env.WXT_LOG_LEVEL;
configureLogging({ level: isLogLevel(envLevel) ? envLevel : env.DEV ? 'debug' : 'info' });

/** Root logger for the extension. Children per area: `log.child('popup')`, `log.child('content')`. */
export const log = createLogger('ext');
