import { Request } from 'express';

/**
 * Safely extract a route parameter as a string.
 * Express 5 returns string | string[] for params.
 */
export function getParam(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}
