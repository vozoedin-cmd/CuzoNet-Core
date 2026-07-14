export interface RouterOsConnection {
  host: string;
  password: string;
  port?: number;
  rejectUnauthorized?: boolean;
  serverName?: string;
  timeoutMs?: number;
  username: string;
}

export interface RouterOsCommand {
  arguments?: Readonly<Record<string, string>>;
  path: string;
  queries?: readonly string[];
}

export interface RouterOsSentence {
  attributes: Readonly<Record<string, string>>;
  type: '!done' | '!fatal' | '!re' | '!trap';
}

export interface RouterOsApiSession {
  close(): Promise<void>;
  execute(command: RouterOsCommand, signal?: AbortSignal): Promise<readonly RouterOsSentence[]>;
}

export interface RouterOsApiClient {
  connect(connection: RouterOsConnection, signal?: AbortSignal): Promise<RouterOsApiSession>;
}
