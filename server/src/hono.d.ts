import type { AppContext } from './context.ts';

declare module 'hono' {
  interface ContextVariableMap {
    ctx: AppContext;
  }
}
