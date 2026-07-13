export interface Migration {
  name: string;
  sql: string;
  version: number;
}
