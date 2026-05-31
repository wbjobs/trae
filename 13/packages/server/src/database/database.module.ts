import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OperationEntity } from './entities/operation.entity';
import { GraphSnapshotEntity } from './entities/graph-snapshot.entity';
import { GraphEntity } from './entities/graph.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'password'),
        database: configService.get('DB_NAME', 'collaborative_graph'),
        entities: [OperationEntity, GraphSnapshotEntity, GraphEntity],
        synchronize: true,
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      OperationEntity,
      GraphSnapshotEntity,
      GraphEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
