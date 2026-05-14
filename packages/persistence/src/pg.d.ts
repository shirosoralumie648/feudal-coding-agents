declare module "pg" {
  export interface QueryResult<Row = Record<string, unknown>> {
    rows: Row[];
    rowCount: number | null;
  }

  export interface PoolClient {
    query<Row = Record<string, unknown>>(
      text: string,
      values?: unknown[]
    ): Promise<QueryResult<Row>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: Record<string, unknown>);

    connect(): Promise<PoolClient>;

    query<Row = Record<string, unknown>>(
      text: string,
      values?: unknown[]
    ): Promise<QueryResult<Row>>;

    end(): Promise<void>;
  }

  export const types: {
    setTypeParser(oid: number, parseFn: (value: string) => unknown): void;
  };
}
