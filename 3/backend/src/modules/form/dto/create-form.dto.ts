import { IsString, IsOptional, MaxLength, IsArray, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { FormField, FormLayout } from '../../../entities/form.entity';

export class CreateFormDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsArray()
  fields?: FormField[];

  @IsOptional()
  @IsObject()
  layout?: FormLayout;
}
