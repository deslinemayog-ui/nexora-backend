import net from 'net';
import IORedis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function buildRedisOptions(): RedisOptions {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times: number) {
      if (env.NODE_ENV === 'test' || times > 5) return null;
      return Math.min(times * 500, 5_000);
    },
  };
}

export class RedisConnectionManager {
  private sharedClient: IORedis | null = null;

  public getClient(): IORedis {
    if (!this.sharedClient) {
      this.sharedClient = new IORedis(buildRedisOptions());
      this.sharedClient.on('error', (err) => {
        logger.debug({ err }, 'Redis connection error event');
      });
    }
    return this.sharedClient;
  }

  public createDedicatedClient(): IORedis {
    const client = new IORedis(buildRedisOptions());
    client.on('error', (err) => {
      logger.debug({ err }, 'Dedicated Redis client error event');
    });
    return client;
  }

  public async healthCheck(): Promise<boolean> {
    const tcpReachable = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        timeout: 800,
      });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (!tcpReachable) {
      return false;
    }

    try {
      const client = this.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      const pong = await client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    if (this.sharedClient) {
      try {
        if (this.sharedClient.status === 'ready') {
          await this.sharedClient.quit();
        } else {
          this.sharedClient.disconnect();
        }
      } catch {
        this.sharedClient.disconnect();
      }
      this.sharedClient = null;
    }
  }
}

export const redisManager = new RedisConnectionManager();
