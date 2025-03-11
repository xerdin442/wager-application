import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway
} from '@nestjs/websockets';
import logger from '@src/common/logger';
import { DbService } from '@src/db/db.service';
import { IncomingMessage } from 'http';

@WebSocketGateway({ path: '/wagers/disputes' })
export class WagersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private clients: Map<string, { client: WebSocket; chatId: string }> = new Map(); // Store active WebSocket connections
  private readonly context: string = WagersGateway.name;

  constructor(private readonly prisma: DbService) { };

  async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
    try {
      // Extract email and dispute chat ID from the URL
      const chatId = new URL(req.url).searchParams.get('chatId')
      const email = new URL(req.url).searchParams.get('email');
      if (!email || !chatId) {
        client.close(1008, 'Missing email or chat ID parameter');  // Reject the connection if any of the url parameters are missing
        return;
      };

      // Verify that the email and chat are valid
      const chat = await this.prisma.chat.findUnique({
        where: { id: +chatId }
      });
      const user = await this.prisma.user.findUnique({
        where: { email }
      });
      if (!user || !chat) {
        client.close(1003, 'Invalid email or chat ID');  // Reject the connection if the user or chat do not exist
        return;
      };

      this.clients.set(email, { client, chatId });
      logger.info(`[${this.context}] Client connected to dispute resolution chat: ${chatId}\n`);

      return;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while connecting to dispute resolution chat. Error: ${error.message}\n`);
      client.close(1011, 'Internal Error');
    }
  }

  handleDisconnect(client: WebSocket): void {
    try {
      // Check if client exists in connection store before deleting
      for (let [key, value] of this.clients.entries()) {
        if (value.client === client) {
          this.clients.delete(key);
          return;
        }
      }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while disconnecting from dispute resolution chat. Error: ${error.message}\n`);
      throw error;
    }
  }

  @SubscribeMessage('chat')
  async handleMessage(client: WebSocket, payload: string): Promise<void> {
    try {
      // Extract payload data
      const data = JSON.parse(payload);
      const { chatId, author, content } = data;
      if (!chatId || !author || !content) {
        client.send(JSON.stringify({ error: 'Invalid payload structure' }));
        return;
      };

      // Save new message to chat
      await this.prisma.message.create({
        data: { author, content, chatId }
      });

      // Broadcast message to other users in the chat
      for (let value of this.clients.values()) {
        if (value.chatId === chatId) {
          value.client.send(JSON.stringify({ author, content }));
        };
      };
      
      return;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while processing messages in dispute resolution chat. Error: ${error.message}\n`);
      throw error;
    }
  }
}
