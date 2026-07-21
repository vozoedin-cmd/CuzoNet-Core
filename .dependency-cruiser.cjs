/**
 * Enforces the layering rules from docs/adr/ADR-001-Clean-Architecture.md:
 *   api -> application -> domain
 *   infrastructure -> application
 * domain never imports another layer or an external package; application
 * never imports infrastructure, api, or concrete framework/SDK packages.
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-application',
      severity: 'error',
      comment: 'domain no debe depender de application (ADR-001).',
      from: { path: '^backend/domain' },
      to: { path: '^backend/application' },
    },
    {
      name: 'domain-no-infrastructure',
      severity: 'error',
      comment: 'domain no debe depender de infrastructure (ADR-001).',
      from: { path: '^backend/domain' },
      to: { path: '^backend/infrastructure' },
    },
    {
      name: 'domain-no-api',
      severity: 'error',
      comment: 'domain no debe depender de api (ADR-001).',
      from: { path: '^backend/domain' },
      to: { path: '^backend/api' },
    },
    {
      name: 'domain-no-external-packages',
      severity: 'error',
      comment:
        'domain solo debe contener entidades, value objects, reglas de negocio y errores; nunca librerias externas (Hito 13.5, parte 2).',
      from: { path: '^backend/domain' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'application-no-infrastructure',
      severity: 'error',
      comment: 'application no debe depender de infrastructure (ADR-001).',
      from: { path: '^backend/application' },
      to: { path: '^backend/infrastructure' },
    },
    {
      name: 'application-no-api',
      severity: 'error',
      comment: 'application no debe depender de api (ADR-001).',
      from: { path: '^backend/application' },
      to: { path: '^backend/api' },
    },
    {
      name: 'application-no-framework-packages',
      severity: 'error',
      comment:
        'application no debe importar Express, SQLite, RouterOS ni SDKs externos concretos (ADR-001).',
      from: { path: '^backend/application' },
      to: {
        path: 'node_modules/(express|better-sqlite3|kysely|@sourceregistry/mikrotik-client|net-snmp|pino|openai)/',
      },
    },
    {
      name: 'api-no-domain',
      severity: 'error',
      comment:
        'api solo puede conocer DTOs y casos de uso de application, nunca entidades de domain (ADR-001, Hito 13.5 parte 4).',
      from: { path: '^backend/api' },
      to: { path: '^backend/domain' },
    },
    {
      name: 'shared-no-upper-layers',
      severity: 'error',
      comment: 'shared solo contiene primitivas estables sin dependencia de otras capas (ADR-001).',
      from: { path: '^backend/shared' },
      to: { path: '^backend/(domain|application|infrastructure|api)' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '^(dist|coverage|tests)',
    },
  },
};
