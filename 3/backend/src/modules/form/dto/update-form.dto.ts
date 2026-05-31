import { IsString, IsOptional, MaxLength, IsArray, IsObject } from 'class-validator';
import { FormField, FormLayout } from '../../../entities/form.entity';

export class UpdateFormDto {
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
  fields?: FormField[];

  @IsOptional()
  @IsObject()
  layout?: FormLayout;
}
