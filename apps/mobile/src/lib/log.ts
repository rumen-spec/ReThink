import { configureLogging, createLogger, isLogLevel } from '@rethink/shared';

// EXPO_PUBLIC_LOG_LEVEL=debug|info|warn|error|silent in apps/mobile/.env; default debug in dev, info otherwise.
const envLevel = process.env.EXPO_PUBLIC_LOG_LEVEL;
configureLogging({ level: isLogLevel(envLevel) ? envLevel : __DEV__ ? 'debug' : 'info' });

/** Root logger for the phone. Make children per area: `log.child('home')`. Never log tokens in clear. */
export const log = createLogger('mobile');
