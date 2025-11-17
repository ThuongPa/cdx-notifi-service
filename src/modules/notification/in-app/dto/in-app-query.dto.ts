import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class InAppQueryDto {
  @ApiProperty({
    description: 'Page number (1-based)',
    required: false,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: 'Filter by seen status (true = read, false = unread)',
    required: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  seen?: boolean;
}

