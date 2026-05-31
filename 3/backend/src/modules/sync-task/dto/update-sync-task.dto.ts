import { IsString, IsEnum, IsObject, IsOptional } from 'class-validator';
import { SyncTargetType, SyncStatus } from '../../entities/sync-task.entity';

export class UpdateSyncTaskDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(SyncTargetType)
  @IsOptional()
  targetType?: SyncTargetType;

  @IsObject()
  @IsOptional()
  config?: any;

  @IsString()
  @IsOptional()
  schedule?: string;

  @IsEnum(SyncStatus)
  @IsOptional()
  status?: SyncStatus;
}
