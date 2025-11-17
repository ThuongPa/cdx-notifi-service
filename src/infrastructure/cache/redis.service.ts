import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { Injectable, Get, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Type } from 'class-transformer';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('redis');

    // Build Redis client config - only include password if it's provided
    const clientConfig: any = {
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
      },
      database: redisConfig.db,
    };

    // Only add password if it's provided and not empty
    if (redisConfig.password && redisConfig.password.trim() !== '') {
      clientConfig.password = redisConfig.password;
    }

    this.client = createClient(clientConfig);

    this.client.on('_', (_) => {
      this.logger.error('_ _ _:', _);
    });

    this.client.on('_', () => {
      this.logger.log('_ _');
    });

    this.client.on('_', () => {
      this.logger.log('_ _');
    });

    this.client.on('_', () => {
      this.logger.warn('_ _ _');
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    try {
      if (!this.client) {
        this.logger.warn('Redis client not initialized, returning null');
        return null;
      }
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (!this.client) {
        this.logger.warn('Redis client not initialized, skipping set operation');
        return;
      }
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (!this.client) {
        this.logger.warn('Redis client not initialized, skipping delete operation');
        return;
      }
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      throw error;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.client.expire(key, ttl);
    } catch (error) {
      this.logger.error(`Error setting expiry for key ${key}:`, error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key}:`, error);
      throw error;
    }
  }

  // Hash helpers expected by tests
  async hget(key: string, field: string): Promise<string | null> {
    try {
      return (await this.client.hGet(key, field)) || null;
    } catch (error) {
      this.logger.error(`Error hget ${key}:${field}:`, error);
      throw error;
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    try {
      await this.client.hSet(key, field, value);
    } catch (error) {
      this.logger.error(`Error hset ${key}:${field}:`, error);
      throw error;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      this.logger.error(`Error hgetall ${key}:`, error);
      throw error;
    }
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    try {
      return await this.client.hIncrBy(key, field, increment);
    } catch (error) {
      this.logger.error(`Error hincrby ${key}:${field}:`, error);
      throw error;
    }
  }

  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }
}
