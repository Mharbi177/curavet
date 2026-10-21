export interface RegisteredRoute {
  method: string;
  url: string;
}

const registry: RegisteredRoute[] = [];

/**
 * Flat record of every registered route, populated by the `onRoute` hook in
 * `buildServer()`.
 *
 * Fastify only exposes routes as an indented tree via `printRoutes()`, which is
 * awkward to assert against. This gives tests, `/api/system/info` and future
 * tooling a precise, machine-readable route list.
 */
export function recordRoute(method: string, url: string): void {
  registry.push({ method, url });
}

export function registeredRoutes(): RegisteredRoute[] {
  return [...registry];
}

export function findRoute(method: string, url: string): boolean {
  return registry.some((r) => r.method === method && r.url === url);
}

export function clearRouteRegistry(): void {
  registry.length = 0;
}
