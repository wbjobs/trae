import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const corsOrigin = configService.get('CORS_ORIGIN', 'http://localhost:5173');

  app.enableCors({
    origin: corsOrigin.split(',').map((s: string) => s.trim()),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  await app.listen(port);

  logger.log(`
========================================
  Collaborative Graph Editor Server
========================================
  HTTP API: http://localhost:${port}/api
  WebSocket: http://localhost:${port}/graph
  CORS Origin: ${corsOrigin}
========================================
  `);
}

bootstrap();
