export class GetNotificationHistoryQuery {
  userId?: string; // Optional - if sourceService or sentBy provided, query all
  page?: number;
  limit?: number;
  type?: string;
  channel?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  sourceService?: string; // ⭐ Filter by source service
  sentBy?: string; // ⭐ Filter by sender user ID
  sortBy?: 'createdAt' | 'sentAt' | 'readAt';
  sortOrder?: 'asc' | 'desc';
}

export interface NotificationHistoryItem {
  id: string;
  correlationId?: string; // ⭐ Correlation ID to track notification request
  title: string;
  body: string;
  type: string;
  channel: string;
  priority: string;
  status: string;
  sentBy: string; // ⭐ User ID of the notification sender (BẮT BUỘC)
  data: Record<string, any>;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationHistoryResult {
  notifications: NotificationHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
