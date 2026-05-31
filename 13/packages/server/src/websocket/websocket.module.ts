import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { GraphGateway } from './graph.gateway';

@Module({
  imports: [GraphModule],
  providers: [GraphGateway],
  exports: [GraphGateway],
})
export class WebSocketModule {}
