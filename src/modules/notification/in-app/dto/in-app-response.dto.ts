import { ApiProperty } from '@nestjs/swagger';

export class InAppMessageDto {
  @ApiProperty({ description: 'Message ID' })
  id: string;

  @ApiProperty({ description: 'Message title' })
  title: string;

  @ApiProperty({ description: 'Message content' })
  content: string;

  @ApiProperty({ description: 'Whether the message has been read' })
  read: boolean;

  @ApiProperty({ description: 'Whether the message has been seen' })
  seen: boolean;

  @ApiProperty({ description: 'Additional data' })
  data?: Record<string, any>;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt: string;

  @ApiProperty({ description: 'Read at timestamp', required: false })
  readAt?: string;
}

export class InAppMessagesResponseDto {
  @ApiProperty({ type: [InAppMessageDto], description: 'List of in-app messages' })
  data: InAppMessageDto[];

  @ApiProperty({ description: 'Total count of messages' })
  totalCount: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Page size' })
  pageSize: number;

  @ApiProperty({ description: 'Whether there are more pages' })
  hasMore: boolean;
}

export class UnreadCountResponseDto {
  @ApiProperty({ description: 'Number of unread messages' })
  count: number;
}

export class MarkAsReadResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;
}

