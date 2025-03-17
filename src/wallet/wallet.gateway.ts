import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway
} from '@nestjs/websockets';
import logger from '@src/common/logger';
import { TransactionNotification } from '@src/common/types';
import { DbService } from '@src/db/db.service';
import { IncomingMessage } from 'http';

@WebSocketGateway({ path: 'wallet/transactions' })
export class WalletGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private clients: Record<string, WebSocket> = {}; // Store active WebSocket connections
  private readonly context: string = WalletGateway.name;

  constructor(private readonly prisma: DbService) { };

  async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
    try {
      // Reject the connection if email is not provided
      const email = new URL(req.url).searchParams.get('email');
      if (!email) {
        client.close(1008, 'Missing email query parameter');
        return;
      };

      // Reject the connection if no user exists with email address
      const user = await this.prisma.user.findUnique({
        where: { email }
      });
      if (!user) {
        client.close(1003, 'Invalid email address');
        return;
      };

      this.clients[email] = client;
      logger.info(`[${this.context}] Client connected to wallet gateway: ${email}\n`);
      return;
    } catch (error) {
      logger.info(`[${this.context}] An error occurred while connecting to wallet gateway. Error: ${error.message}\n`);
      throw error;
    }    
  }

  handleDisconnect(client: WebSocket) {
    try {
      // Check if client exists in connection store before deleting
      const email = Object.keys(this.clients).find(key => this.clients[key] === client);
      if (email) {
        delete this.clients[email]
        logger.info(`[${this.context}] Client disconnected from wallet gateway: ${email}\n`);
      }
      return;
    } catch (error) {
      logger.info(`[${this.context}] An error occurred while disconnecting from wallet gateway. Error: ${error.message}\n`);
      throw error;
    }
  }

  sendTransactionStatus(email: string, notification: TransactionNotification) {
    try {
      const client = this.clients[email];
      if (client) {
        client.send(JSON.stringify({ notification }));
        return;
      }
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while notifying client of transaction status. Error: ${error.message}`);
      throw error;
    }
  }
}
