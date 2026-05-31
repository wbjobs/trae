import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { OTModule } from './ot/ot.module';
import { GraphModule } from './graph/graph.module';
import { WebSocketModule } from './websocket/websocket.module';
import { BranchModule } from './branch/branch.module';
import { DatabaseStorageService } from './database/database-storage.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    OTModule,
    GraphModule,
    WebSocketModule,
    BranchModule,
  ],
  providers: [DatabaseStorageService],
})
export class AppModule {}
