import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * Manages WebSocket connections for users
 * Maps userId -> Set of Socket connections
 */
@Injectable()
export class WebSocketConnectionManager {
  private readonly logger = new Logger(WebSocketConnectionManager.name);
  private readonly userConnections = new Map<string, Set<Socket>>();

  /**
   * Add a connection for a user
   */
  addConnection(userId: string, socket: Socket): void {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socket);
    this.logger.log(`Added connection for user ${userId}. Total connections: ${this.getUserConnectionCount(userId)}`);
  }

  /**
   * Remove a connection for a user
   */
  removeConnection(userId: string, socket: Socket): void {
    const connections = this.userConnections.get(userId);
    if (connections) {
      connections.delete(socket);
      if (connections.size === 0) {
        this.userConnections.delete(userId);
      }
      this.logger.log(`Removed connection for user ${userId}. Remaining connections: ${this.getUserConnectionCount(userId)}`);
    }
  }

  /**
   * Get all connections for a user
   */
  getUserConnections(userId: string): Set<Socket> {
    return this.userConnections.get(userId) || new Set();
  }

  /**
   * Get connection count for a user
   */
  getUserConnectionCount(userId: string): number {
    return this.getUserConnections(userId).size;
  }

  /**
   * Broadcast message to all connections of a user
   */
  broadcastToUser(userId: string, event: string, data: any): void {
    const connections = this.getUserConnections(userId);
    if (connections.size === 0) {
      this.logger.debug(`No connections found for user ${userId}`);
      return;
    }

    connections.forEach((socket) => {
      if (socket.connected) {
        socket.emit(event, data);
      }
    });

    this.logger.log(`Broadcasted ${event} to ${connections.size} connection(s) for user ${userId}`);
  }

  /**
   * Broadcast message to all connected users
   */
  broadcastToAll(server: Server, event: string, data: any): void {
    server.emit(event, data);
    this.logger.log(`Broadcasted ${event} to all connected clients`);
  }

  /**
   * Get total number of connected users
   */
  getTotalUsers(): number {
    return this.userConnections.size;
  }

  /**
   * Get total number of connections
   */
  getTotalConnections(): number {
    let total = 0;
    this.userConnections.forEach((connections) => {
      total += connections.size;
    });
    return total;
  }

  /**
   * Cleanup disconnected sockets
   */
  cleanup(): void {
    this.userConnections.forEach((connections, userId) => {
      const disconnectedSockets: Socket[] = [];
      connections.forEach((socket) => {
        if (!socket.connected) {
          disconnectedSockets.push(socket);
        }
      });
      disconnectedSockets.forEach((socket) => {
        this.removeConnection(userId, socket);
      });
    });
  }
}

