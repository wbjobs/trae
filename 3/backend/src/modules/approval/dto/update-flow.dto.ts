import { IsString, IsOptional, MaxLength, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { NodeType, ApprovalType } from '../../../entities/approval-node.entity';
import { FlowStatus } from '../../../entities/approval-flow.entity';

class ApproverConfigDto {
  @IsString()
  type: string;

  @IsString()
  value: string;
}

class NodeConditionDto {
  @IsString()
  field: string;

  @IsString()
  operator: string;

  value: any;
}

class ApprovalNodeDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(NodeType)
  type: NodeType;

  @IsOptional()
  @IsString()
  prevNodeId?: string;

  @IsOptional()
  @IsString()
  nextNodeId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproverConfigDto)
  approvers?: ApproverConfigDto[];

  @IsOptional()
  @IsEnum(ApprovalType)
  approvalType?: ApprovalType;

  @IsOptional()
  @ValidateNested()
  @Type(() => NodeConditionDto)
  condition?: NodeConditionDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalNodeDto)
  nodes?: ApprovalNodeDto[];

  @IsOptional()
  @IsEnum(FlowStatus)
  status?: FlowStatus;
}
