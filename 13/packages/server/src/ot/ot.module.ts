import { Module, Global } from '@nestjs/common';
import { OTService } from './ot.service';

@Global()
@Module({
  providers: [OTService],
  exports: [OTService],
})
export class OTModule {}
