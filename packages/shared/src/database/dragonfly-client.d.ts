import { Redis } from 'ioredis';
type RedisClient = Redis;
declare class DragonflyClient {
    private client;
    private subscriber;
    constructor();
    private init;
    private setupEventHandlers;
    connect(): Promise<void>;
    getClient(): RedisClient;
    getSubscriber(): RedisClient;
    disconnect(): Promise<void>;
}
export declare const dragonfly: DragonflyClient;
export {};
//# sourceMappingURL=dragonfly-client.d.ts.map