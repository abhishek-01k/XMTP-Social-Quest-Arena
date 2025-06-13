declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage } from 'http';
  import { Socket } from 'net';

  export interface WebSocketServerOptions {
    server?: any;
    port?: number;
    host?: string;
  }

  export interface WebSocket extends EventEmitter {
    readyState: number;
    OPEN: number;
    CLOSED: number;
    CONNECTING: number;
    CLOSING: number;
    send(data: string | Buffer): void;
    close(): void;
    on(event: 'message', listener: (data: Buffer) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    clients: Set<WebSocket>;
    constructor(options: WebSocketServerOptions);
    on(event: 'connection', listener: (ws: WebSocket, request: IncomingMessage) => void): this;
  }
} 