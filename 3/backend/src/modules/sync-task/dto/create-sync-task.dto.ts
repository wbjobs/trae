import { IsString, IsEnum, IsObject, IsOptional } from 'class-validator';
import { SyncTargetType } from '../../entities/sync-task.entity';

export class CreateSyncTaskDto {
  @IsString()
  formId: string;

  @IsString()
  name: string;

  @IsEnum(SyncTargetType)
  targetType: SyncTargetType;

  @IsObject()
  config: any;

  @IsString()
  schedule: string;
}
