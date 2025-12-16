import { IsString, IsUrl, IsOptional, IsArray, IsNotEmpty } from 'class-validator';

export class RegisterWebhookDto {
  @IsUrl({ require_protocol: true })
  @IsNotEmpty()
  url: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  events: string[];

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

