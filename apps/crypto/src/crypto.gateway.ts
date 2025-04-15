import { DbService } from '@app/db';
import { UtilsService } from '@app/utils';
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import { CryptoTransaction } from './types';

@WebSocketGateway({ path: 'wallet/crypto' })
export class CryptoGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private clients: Record<string, WebSocket> = {}; // Store active WebSocket connections
  private readonly context: string = CryptoGateway.name;

  constructor(
    private readonly prisma: DbService,
    private readonly utils: UtilsService,
  ) {}

  async handleConnection(
    client: WebSocket,
    req: IncomingMessage,
  ): Promise<void> {
    try {
      // Reject the connection if email is not provided
      const email = new URL(req.url as string).searchParams.get('email');
      if (!email) {
        client.close(1008, 'Missing email query parameter');
        return;
      }

      // Reject the connection if no user exists with email address
      const user = await this.prisma.user.findUnique({
        where: { email },
      });
      if (!user) {
        client.close(1003, 'Invalid email address');
        return;
      }

      this.clients[email] = client;
      this.utils
        .logger()
        .info(
          `[${this.context}] Client connected to crypto gateway: ${email}\n`,
        );

      return;
    } catch (error) {
      this.utils
        .logger()
        .info(
          `[${this.context}] An error occurred while connecting to crypto gateway. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  handleDisconnect(client: WebSocket) {
    try {
      // Check if client exists in connection store before deleting
      const email = Object.keys(this.clients).find(
        (key) => this.clients[key] === client,
      );

      if (email) {
        delete this.clients[email];
        this.utils
          .logger()
          .info(
            `[${this.context}] Client disconnected from crypto gateway: ${email}\n`,
          );
      }

      return;
    } catch (error) {
      this.utils
        .logger()
        .info(
          `[${this.context}] An error occurred while disconnecting from crypto gateway. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  sendTransactionStatus(email: string, transaction: CryptoTransaction) {
    try {
      const client = this.clients[email];
      if (client) {
        client.send(JSON.stringify({ transaction }));
        return;
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while notifying client of transaction status. Error: ${error.message}`,
        );

      throw error;
    }
  }
}
