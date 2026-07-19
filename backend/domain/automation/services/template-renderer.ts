import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';

export interface TemplateRendererOptions {
  maxDepth?: number;
  maxProperties?: number;
  maxStringLength?: number;
}

export class TemplateRenderer {
  private readonly maxDepth: number;
  private readonly maxProperties: number;
  private readonly maxStringLength: number;

  public constructor(options: TemplateRendererOptions = {}) {
    this.maxDepth = options.maxDepth ?? 10;
    this.maxProperties = options.maxProperties ?? 1000;
    this.maxStringLength = options.maxStringLength ?? 100_000;
  }

  public render(template: unknown, context: Record<string, unknown>): unknown {
    let propertiesCount = 0;

    const renderNode = (node: unknown, depth: number): unknown => {
      if (depth > this.maxDepth) {
        throw new InvalidAutomationRuleError('template', 'Profundidad máxima excedida en la plantilla.');
      }

      if (typeof node === 'string') {
        const rendered = this.renderString(node, context);
        if (rendered.length > this.maxStringLength) {
          throw new InvalidAutomationRuleError('template', 'Longitud de string excedida en la plantilla.');
        }
        return rendered;
      }

      if (Array.isArray(node)) {
        propertiesCount += node.length;
        if (propertiesCount > this.maxProperties) {
          throw new InvalidAutomationRuleError('template', 'Demasiadas propiedades en la plantilla.');
        }
        return node.map((child) => renderNode(child, depth + 1));
      }

      if (typeof node === 'object' && node !== null) {
        // Prevent prototype traversal
        if (Object.getPrototypeOf(node) !== Object.prototype && Object.getPrototypeOf(node) !== null) {
          throw new InvalidAutomationRuleError('template', 'Solo se permiten objetos JSON puros.');
        }

        const entries = Object.entries(node);
        propertiesCount += entries.length;
        if (propertiesCount > this.maxProperties) {
          throw new InvalidAutomationRuleError('template', 'Demasiadas propiedades en la plantilla.');
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of entries) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new InvalidAutomationRuleError('template', 'Propiedades de prototipo no permitidas.');
          }
          result[key] = renderNode(value, depth + 1);
        }
        return result;
      }

      return node;
    };

    return renderNode(template, 0);
  }

  private renderString(template: string, context: Record<string, unknown>): string {
    // Regex for {{path}}
    return template.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (match, path: string) => {
      const parts = path.split('.');
      let current: unknown = context;

      for (const part of parts) {
        if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
          throw new InvalidAutomationRuleError('template', 'Propiedades de prototipo no permitidas en la ruta.');
        }

        if (current === undefined || current === null) {
          throw new InvalidAutomationRuleError('template', `Campo faltante en el contexto: ${path}`);
        }

        if (typeof current !== 'object') {
          throw new InvalidAutomationRuleError('template', `Campo faltante en el contexto: ${path}`);
        }

        current = (current as Record<string, unknown>)[part];
      }

      if (current === undefined || current === null) {
        throw new InvalidAutomationRuleError('template', `Campo faltante en el contexto: ${path}`);
      }

      if (typeof current === 'object' || typeof current === 'function') {
         throw new InvalidAutomationRuleError('template', `El valor en ${path} no es primitivo.`);
      }

      return String(current);
    });
  }
}
