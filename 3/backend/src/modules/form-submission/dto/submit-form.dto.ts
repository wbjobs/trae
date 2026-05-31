import { IsObject } from 'class-validator';

export class SubmitFormDto {
  @IsObject()
  data: Record<string, any>;
}
