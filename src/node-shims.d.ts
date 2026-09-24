// Minimal ambient declarations for the slice of Node's runtime the
// CLI touches. Pulling in @types/node would mean a devDependency and
// a lockfile, which is more than a handful of signatures is worth.

declare const process: {
  readonly argv: string[];
  exit(code: number): never;
  readonly stdout: { write(chunk: string): void };
  readonly stderr: { write(chunk: string): void };
  readonly stdin: {
    setEncoding(encoding: string): void;
    on(event: 'data', listener: (chunk: string) => void): void;
    on(event: 'end', listener: () => void): void;
  };
};

declare module 'fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
