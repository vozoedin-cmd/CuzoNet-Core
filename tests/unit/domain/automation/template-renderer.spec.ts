import { describe, expect, it } from 'vitest';
import { TemplateRenderer } from '../../../../backend/domain/automation/services/template-renderer.js';
import { InvalidAutomationRuleError } from '../../../../backend/domain/automation/errors/invalid-automation-rule.error.js';

describe('TemplateRenderer', () => {
  const renderer = new TemplateRenderer();

  it('renders a string without templates verbatim', () => {
    expect(renderer.render('hello world', {})).toBe('hello world');
  });

  it('renders a simple primitive value', () => {
    const context = { event: { id: 123, status: 'open' } };
    expect(renderer.render('ID is {{event.id}}', context)).toBe('ID is 123');
    expect(renderer.render('Status: {{event.status}}', context)).toBe('Status: open');
  });

  it('replaces multiple occurrences', () => {
    const context = { event: { name: 'server' } };
    expect(renderer.render('{{event.name}} - {{event.name}}', context)).toBe('server - server');
  });

  it('renders deeply nested objects and arrays', () => {
    const context = { event: { data: 'test' } };
    const template = {
      action: 'start',
      tags: ['a', 'b', '{{event.data}}'],
      meta: {
        info: '{{event.data}}',
      },
    };

    const result = renderer.render(template, context);

    expect(result).toEqual({
      action: 'start',
      tags: ['a', 'b', 'test'],
      meta: {
        info: 'test',
      },
    });
  });

  it('throws when a required field is missing', () => {
    const context = { event: { id: 123 } };
    expect(() => renderer.render('Missing: {{event.name}}', context)).toThrow(InvalidAutomationRuleError);
  });

  it('throws on prototype traversal in path', () => {
    const context = { event: {} };
    expect(() => renderer.render('{{event.__proto__.polluted}}', context)).toThrow(InvalidAutomationRuleError);
    expect(() => renderer.render('{{event.constructor.name}}', context)).toThrow(InvalidAutomationRuleError);
  });

  it('throws on prototype keys in object templates', () => {
    const template = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(() => renderer.render(template, {})).toThrow(InvalidAutomationRuleError);
  });

  it('throws when template has non-JSON pure objects (like Date or RegExp)', () => {
    const template = { date: new Date() };
    expect(() => renderer.render(template, {})).toThrow(InvalidAutomationRuleError);
  });

  it('enforces maximum nesting depth', () => {
    const strictRenderer = new TemplateRenderer({ maxDepth: 2 });
    expect(() => strictRenderer.render({ a: { b: { c: 1 } } }, {})).toThrow(InvalidAutomationRuleError);
    expect(strictRenderer.render({ a: { b: 1 } }, {})).toEqual({ a: { b: 1 } });
  });

  it('enforces maximum properties count', () => {
    const strictRenderer = new TemplateRenderer({ maxProperties: 3 });
    expect(() => strictRenderer.render([1, 2, 3, 4], {})).toThrow(InvalidAutomationRuleError);
    expect(() => strictRenderer.render({ a: 1, b: 2, c: 3, d: 4 }, {})).toThrow(InvalidAutomationRuleError);
  });
});
