import type { NetworkLinkController } from './network-link.controller.js';

export interface HttpRouter {
  post: (path: string, handler: unknown) => void;
  get: (path: string, handler: unknown) => void;
}

export function setupNetworkLinkRoutes(router: HttpRouter, controller: NetworkLinkController): void {
  router.post('/enlaces', controller.create.bind(controller));
  router.get('/enlaces', controller.list.bind(controller));
  router.get('/enlaces/:linkId', controller.get.bind(controller));
}
