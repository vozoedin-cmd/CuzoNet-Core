import type { NetworkNodeController } from './network-node.controller.js';

export interface HttpRouter {
  post: (path: string, handler: unknown) => void;
  get: (path: string, handler: unknown) => void;
}

export function setupNetworkNodeRoutes(router: HttpRouter, controller: NetworkNodeController): void {
  router.post('/nodos', controller.create.bind(controller));
  router.get('/nodos', controller.list.bind(controller));
  router.get('/nodos/:nodeId', controller.get.bind(controller));
}
