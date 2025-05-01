import { DbService } from '@app/db';
import { UtilsService } from '@app/utils';
import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
  BaseWsExceptionFilter,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { FiatTransactionNotification } from './types';
import { UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@UsePipes(
  new ValidationPipe({ exceptionFactory: (errors) => new WsException(errors) }),
)
@UseFilters(new BaseWsExceptionFilter())
@WebSocketGateway(8080, { path: 'wallet/fiat' })
export class FiatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  private readonly context: string = FiatGateway.name;

  constructor(
    private readonly prisma: DbService,
    private readonly utils: UtilsService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      // Reject the connection if email is not provided
      const email = client.handshake.query.email as string;
      if (!email) throw new WsException('Missing email query parameter');

      // Reject the connection if no user exists with email address
      const user = await this.prisma.user.findUnique({
        where: { email },
      });
      if (!user) throw new WsException('Invalid email address');

      client.data.email = email; // Attach email to the socket instance

      this.utils
        .logger()
        .info(`[${this.context}] Client connected to fiat gateway: ${email}\n`);
    } catch (error) {
      this.utils
        .logger()
        .info(
          `[${this.context}] An error occurred while connecting to fiat gateway. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    try {
      const email = client.data?.email as string;
      if (email) {
        this.utils
          .logger()
          .info(`[${this.context}] Client disconnected: ${email}`);
      }
    } catch (error) {
      this.utils
        .logger()
        .info(
          `[${this.context}] An error occurred while disconnecting from fiat gateway. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  sendTransactionStatus(
    email: string,
    notification: FiatTransactionNotification,
  ) {
    try {
      const client = Array.from(this.server.sockets.sockets.values()).find(
        (socket) => socket.data.email === email,
      );

      if (client) {
        client.emit('transaction-status', notification);
      } else {
        throw new WsException(
          `Transaction notification failed: No active socket for ${email}.`,
        );
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
