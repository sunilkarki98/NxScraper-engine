/// <reference types="node" resolution-mode="require"/>
import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';
export declare const contextStorage: AsyncLocalStorage<Map<string, any>>;
declare const logger: pino.Logger<never, boolean>;
export default logger;
//# sourceMappingURL=logger.d.ts.map