export class Logger {
  private prefix = '[WeatherServer]';

  info(message: string, data?: unknown): void {
    console.error(`${this.prefix} [INFO] ${message}`, data ? JSON.stringify(data) : '');
  }

  warn(message: string, data?: unknown): void {
    console.error(`${this.prefix} [WARN] ${message}`, data ? JSON.stringify(data) : '');
  }

  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      console.error(`${this.prefix} [ERROR] ${message}`, error.message, error.stack);
    } else {
      console.error(`${this.prefix} [ERROR] ${message}`, error);
    }
  }
}

export const logger = new Logger();
