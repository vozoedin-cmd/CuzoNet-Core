import { createServer } from 'node:http';

import { IncidentAlertingController } from './api/alerting/incident-alerting.controller.js';
import { createIncidentAlertingRouter } from './api/alerting/incident-alerting.routes.js';
import { NotificationsController } from './api/notifications/notifications.controller.js';
import { createNotificationsRouter } from './api/notifications/notifications.routes.js';
import { ClientsController } from './api/clients/controller/clients.controller.js';
import { BillingController } from './api/billing/controller/billing.controller.js';
import { createBillingRouter } from './api/billing/routes/billing.routes.js';
import { createClientsRouter } from './api/clients/routes/clients.routes.js';
import { DashboardController } from './api/dashboard/dashboard.controller.js';
import { createDashboardRouter } from './api/dashboard/dashboard.routes.js';
import { EquipmentController } from './api/inventory/equipment.controller.js';
import { createEquipmentRouter } from './api/inventory/equipment.routes.js';
import { MonitoringController } from './api/monitoring/monitoring.controller.js';
import { createMonitoringRouter } from './api/monitoring/monitoring.routes.js';
import { createApp } from './api/http/app.js';
import { ProvisioningController } from './api/provisioning/controller/provisioning.controller.js';
import { createProvisioningRouter } from './api/provisioning/routes/provisioning.routes.js';
import { PlansController } from './api/plans/controller/plans.controller.js';
import { createPlansRouter } from './api/plans/routes/plans.routes.js';
import { ServicesController } from './api/services/controller/services.controller.js';
import { createServicesRouter } from './api/services/routes/services.routes.js';
import { GetBillingSummaryQuery } from './application/queries/dashboard/get-billing-summary.query.js';
import { GetDashboardOverviewQuery } from './application/queries/dashboard/get-dashboard-overview.query.js';
import { GetNetworkHealthQuery } from './application/queries/dashboard/get-network-health.query.js';
import { AcknowledgeIncidentUseCase } from './application/use-cases/alerting/acknowledge-incident.usecase.js';
import { GetIncidentUseCase } from './application/use-cases/alerting/get-incident.usecase.js';
import { IncidentEngine } from './application/use-cases/alerting/incident-engine.js';
import { ListAlertRulesUseCase } from './application/use-cases/alerting/list-alert-rules.usecase.js';
import { ListIncidentsUseCase } from './application/use-cases/alerting/list-incidents.usecase.js';
import { EvaluateAlertsUseCase } from './application/use-cases/alerting/evaluate-alerts.usecase.js';
import { InstallDefaultAlertRulesUseCase } from './application/use-cases/alerting/install-default-alert-rules.usecase.js';
import { CancelNotificationUseCase } from './application/use-cases/notifications/cancel-notification.usecase.js';
import { CreateNotificationsFromIncidentEventUseCase } from './application/use-cases/notifications/create-notifications-from-incident-event.usecase.js';
import { DispatchPendingNotificationUseCase } from './application/use-cases/notifications/dispatch-pending-notification.usecase.js';
import { GetNotificationUseCase } from './application/use-cases/notifications/get-notification.usecase.js';
import { ListNotificationsUseCase } from './application/use-cases/notifications/list-notifications.usecase.js';
import {
  CreateNotificationDestinationUseCase,
  DeleteNotificationDestinationUseCase,
  ListNotificationDestinationsUseCase,
  UpdateNotificationDestinationUseCase,
} from './application/use-cases/notifications/manage-notification-destinations.usecase.js';
import {
  NotificationChannelRegistry,
  NotificationDispatcher,
} from './application/use-cases/notifications/notification-dispatcher.js';
import { NotificationEventHandler } from './application/use-cases/notifications/notification-event-handler.js';
import { RetryNotificationUseCase } from './application/use-cases/notifications/retry-notification.usecase.js';
import { GetLatestStateUseCase } from './application/use-cases/monitoring/get-latest-state.usecase.js';
import { GetTimeSeriesUseCase } from './application/use-cases/monitoring/get-time-series.usecase.js';
import { GetTopologyStateUseCase } from './application/use-cases/monitoring/get-topology-state.usecase.js';
import { RecordObservationBatchUseCase } from './application/use-cases/monitoring/record-observation-batch.usecase.js';
import { CreateEquipmentUseCase } from './application/inventory/create-equipment.usecase.js';
import { SetEquipmentManagementHostUseCase } from './application/inventory/set-equipment-management-host.usecase.js';
import { ArchiveClient } from './application/use-cases/clients/archive-client/archive-client.use-case.js';
import { CreateClient } from './application/use-cases/clients/create-client/create-client.use-case.js';
import { GetClient } from './application/use-cases/clients/get-client/get-client.use-case.js';
import { ListClients } from './application/use-cases/clients/list-clients/list-clients.use-case.js';
import { UpdateClient } from './application/use-cases/clients/update-client/update-client.use-case.js';
import { CreatePlan } from './application/use-cases/plans/create-plan/create-plan.use-case.js';
import { ListPlans } from './application/use-cases/plans/list-plans/list-plans.use-case.js';
import { RevisePlan } from './application/use-cases/plans/revise-plan/revise-plan.use-case.js';
import { CreateService } from './application/use-cases/services/create-service/create-service.use-case.js';
import { GetService } from './application/use-cases/services/get-service/get-service.use-case.js';
import { ListClientServices } from './application/use-cases/services/list-client-services/list-client-services.use-case.js';
import { GetProvisioningOperation } from './application/use-cases/provisioning/get-provisioning-operation/get-provisioning-operation.use-case.js';
import { RequestProvisioningOperation } from './application/use-cases/provisioning/request-provisioning-operation/request-provisioning-operation.use-case.js';
import { GetClientAccountSummary } from './application/use-cases/billing/accounts/get-client-account-summary/get-client-account-summary.use-case.js';
import { ListPayments } from './application/use-cases/billing/payments/list-payments/list-payments.use-case.js';
import { RecordPayment } from './application/use-cases/billing/payments/record-payment/record-payment.use-case.js';
import type { BillingActorContext } from './application/ports/billing/billing-actor-context.port.js';
import type { Clock } from './application/ports/clock.port.js';
import type { CompanyContext } from './application/ports/company-context.port.js';
import type { ActorContext } from './application/ports/provisioning/actor-context.port.js';
import { AlertEvaluator } from './domain/alerting/alert-evaluator.js';
import { NotificationPolicy } from './domain/notifications/notification-policy.js';
import { NotificationRetryPolicy } from './domain/notifications/notification-retry-policy.js';
import { NotificationTemplateRenderer } from './domain/notifications/notification-template.js';
import { environment } from './infrastructure/config/environment.js';
import { InMemoryDashboardCache } from './infrastructure/dashboard/in-memory-dashboard.cache.js';
import { SqliteDashboardReaders } from './infrastructure/dashboard/sqlite-dashboard.readers.js';
import { SqliteEquipmentRepository } from './infrastructure/inventory/sqlite-equipment.repository.js';
import { SqliteAlertRuleRepository } from './infrastructure/alerting/sqlite-alert-rule.repository.js';
import { SqliteIncidentRepository } from './infrastructure/alerting/sqlite-incident.repository.js';
import { SqliteIncidentEventRepository } from './infrastructure/alerting/sqlite-incident-event.repository.js';
import { SqliteAlertEvaluationStateRepository } from './infrastructure/alerting/sqlite-alert-evaluation-state.repository.js';
import { NoOpMaintenanceWindowProvider } from './infrastructure/alerting/no-op-maintenance-window.provider.js';
import {
  DisabledEmailNotificationChannel,
  DisabledTelegramNotificationChannel,
} from './infrastructure/notifications/disabled-notification.channels.js';
import { EvolutionApiWhatsAppNotificationChannel } from './infrastructure/notifications/whatsapp-notification.channel.js';
import { EnvironmentNotificationCredentialProvider } from './infrastructure/notifications/environment-notification-credential.provider.js';
import { SqliteNotificationAttemptRepository } from './infrastructure/notifications/sqlite-notification-attempt.repository.js';
import { SqliteNotificationDestinationRepository } from './infrastructure/notifications/sqlite-notification-destination.repository.js';
import { SqliteNotificationEventReceiptRepository } from './infrastructure/notifications/sqlite-notification-event-receipt.repository.js';
import { SqliteNotificationRepository } from './infrastructure/notifications/sqlite-notification.repository.js';
import { WebhookNotificationChannel } from './infrastructure/notifications/webhook-notification.channel.js';
import { SqliteEquipmentStateRepository } from './infrastructure/monitoring/sqlite-equipment-state.repository.js';
import { CollectorRegistry } from './infrastructure/monitoring/collector-registry.js';
import { EnvironmentMonitoringCredentialProvider } from './infrastructure/monitoring/environment-monitoring-credential.provider.js';
import { EnvironmentRouterOsCredentialProvider } from './infrastructure/monitoring/environment-routeros-credential.provider.js';
import { InventoryMonitoringTargetResolver } from './infrastructure/monitoring/inventory-monitoring-target-resolver.js';
import { PingCollector } from './infrastructure/monitoring/ping.collector.js';
import { RouterOsCollector } from './infrastructure/monitoring/routeros.collector.js';
import { SnmpCollector } from './infrastructure/monitoring/snmp.collector.js';
import { SourcePriorityObservationPolicy } from './infrastructure/monitoring/source-priority-observation.policy.js';
import { SystemPingProbe } from './infrastructure/monitoring/system-ping.probe.js';
import { SystemRouterOsClient } from './infrastructure/monitoring/system-routeros.client.js';
import { SystemSnmpProbe } from './infrastructure/monitoring/system-snmp.probe.js';
import { SqliteInventoryReaderAdapter } from './infrastructure/monitoring/sqlite-inventory-reader.adapter.js';
import { SqliteNetworkReaderAdapter } from './infrastructure/monitoring/sqlite-network-reader.adapter.js';
import { SqliteObservationRepository } from './infrastructure/monitoring/sqlite-observation.repository.js';
import { NoOpCollector } from './infrastructure/monitoring/no-op.collector.js';
import { SqliteClientRepository } from './infrastructure/database/clients/sqlite/sqlite-client-repository.js';
import { SqlitePlanRepository } from './infrastructure/database/plans/sqlite/sqlite-plan-repository.js';
import { SqlitePlanReader } from './infrastructure/plans/readers/sqlite-plan-reader.js';
import { SqliteInvoiceRepository } from './infrastructure/database/billing/invoices/sqlite/sqlite-invoice-repository.js';
import { SqlitePaymentRepository } from './infrastructure/database/billing/payments/sqlite/sqlite-payment-repository.js';
import { ClientBillingReaderAdapter } from './infrastructure/billing/clients/client-billing-reader.adapter.js';
import { SqliteCompanyBillingSettings } from './infrastructure/billing/settings/sqlite-company-billing-settings.js';
import { SqliteOutboxRepository } from './infrastructure/events/sqlite/sqlite-outbox-repository.js';
import { SqliteServiceRepository } from './infrastructure/database/services/sqlite/sqlite-service-repository.js';
import { SqliteProvisioningOperationRepository } from './infrastructure/database/provisioning/sqlite/sqlite-provisioning-operation-repository.js';
import { CompanyBootstrap } from './infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { DatabaseHealthChecker } from './infrastructure/database/sqlite/database-health-checker.js';
import { MigrationRunner } from './infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from './infrastructure/database/sqlite/sqlite-database.js';
import { SqliteUnitOfWork } from './infrastructure/database/sqlite/sqlite-unit-of-work.js';
import { UuidV7IdGenerator } from './infrastructure/identity/uuid-v7-id-generator.js';
import { logger } from './infrastructure/logging/logger.js';
import { ExponentialRetryPolicy } from './infrastructure/provisioning/retry/exponential-retry-policy.js';
import { ServiceReaderProvisioningAdapter } from './infrastructure/provisioning/services/service-reader-provisioning.adapter.js';
import { SqliteSingleCompanyContext } from './infrastructure/tenancy/sqlite-single-company-context.js';
import { MonitoringWorker } from './infrastructure/workers/monitoring-worker.js';
import { NotificationDispatchWorker } from './infrastructure/workers/notification-dispatch-worker.js';
import {
  NotificationOutboxWorker,
  SqliteNotificationOutboxWorkRepository,
} from './infrastructure/workers/notification-outbox-worker.js';
import {
  OutboxWorker,
  SqliteOutboxWorkRepository,
} from './infrastructure/workers/outbox-worker.js';
import { SqliteWorkLeaseRepository } from './infrastructure/workers/sqlite/sqlite-work-lease-repository.js';
import { SqliteWorkerStatisticsRepository } from './infrastructure/workers/sqlite/sqlite-worker-statistics-repository.js';
import { WorkerHost } from './infrastructure/workers/worker-host.js';

const shutdownTimeoutMs = 10_000;
const idGenerator = new UuidV7IdGenerator();
const clock: Clock = {
  now: () => new Date(),
};
const sqlite = new SqliteDatabase({
  busyTimeoutMs: environment.DATABASE_BUSY_TIMEOUT_MS,
  path: environment.DATABASE_PATH,
});
new MigrationRunner(sqlite.connection, clock).migrate();
const companyId = await new CompanyBootstrap(sqlite.session, idGenerator).bootstrap(
  {
    currencyCode: 'GTQ',
    displayName: environment.APP_NAME,
    legalName: environment.APP_NAME,
    timezone: environment.TIMEZONE,
  },
  clock.now(),
);
new DatabaseHealthChecker(sqlite.connection).assertHealthy();
const companyContext: CompanyContext = new SqliteSingleCompanyContext(companyId);
const unitOfWork = new SqliteUnitOfWork(sqlite.session);
const outbox = new SqliteOutboxRepository(sqlite.session);
const clientRepository = new SqliteClientRepository(sqlite.session, idGenerator);
const planRepository = new SqlitePlanRepository(sqlite.session);
const planReader = new SqlitePlanReader(sqlite.session);
const serviceRepository = new SqliteServiceRepository(sqlite.session);
const provisioningRepository = new SqliteProvisioningOperationRepository(sqlite.session);
const provisioningRetryPolicy = new ExponentialRetryPolicy(3);
const billingInvoiceRepository = new SqliteInvoiceRepository(sqlite.session);
const billingPaymentRepository = new SqlitePaymentRepository(sqlite.session);
const billingSettings = new SqliteCompanyBillingSettings(sqlite.session);
const actorContext: ActorContext = { getActorId: () => 'temporary-server-context' };
const billingActorContext: BillingActorContext = { getActorId: () => 'temporary-server-context' };
const dashboardReaders = new SqliteDashboardReaders(sqlite.connection, clock);
const dashboardCache = new InMemoryDashboardCache();
const dashboardController = new DashboardController({
  billingSummary: new GetBillingSummaryQuery(dashboardReaders, dashboardCache),
  companyContext,
  networkHealth: new GetNetworkHealthQuery(dashboardReaders, dashboardCache),
  overview: new GetDashboardOverviewQuery(
    dashboardReaders,
    dashboardReaders,
    dashboardReaders,
    dashboardReaders,
    dashboardCache,
  ),
});
const dashboardRouter = createDashboardRouter(dashboardController);
const equipmentRepository = new SqliteEquipmentRepository(sqlite.connection);
const equipmentController = new EquipmentController(
  new CreateEquipmentUseCase(equipmentRepository, idGenerator),
  new SetEquipmentManagementHostUseCase(equipmentRepository),
);
const equipmentRouter = createEquipmentRouter(equipmentController);
const observationRepository = new SqliteObservationRepository(sqlite.connection);
const equipmentStateRepository = new SqliteEquipmentStateRepository(sqlite.connection);
const monitoringInventoryReader = new SqliteInventoryReaderAdapter(sqlite.connection);
const alertRuleRepository = new SqliteAlertRuleRepository(sqlite.connection);
await new InstallDefaultAlertRulesUseCase(alertRuleRepository, idGenerator, clock).execute(
  companyId,
);
const incidentRepository = new SqliteIncidentRepository(sqlite.connection);
const incidentEventRepository = new SqliteIncidentEventRepository(sqlite.connection);
const alertEvaluationStateRepository = new SqliteAlertEvaluationStateRepository(sqlite.connection);
const incidentEngine = new IncidentEngine(
  incidentRepository,
  incidentEventRepository,
  outbox,
  unitOfWork,
  idGenerator,
);
const alertEvaluator = new EvaluateAlertsUseCase(
  alertRuleRepository,
  alertEvaluationStateRepository,
  new AlertEvaluator(),
  incidentEngine,
  new NoOpMaintenanceWindowProvider(),
);
const incidentAlertingController = new IncidentAlertingController({
  acknowledgeIncident: new AcknowledgeIncidentUseCase(incidentEngine, clock),
  getIncident: new GetIncidentUseCase(incidentRepository),
  listAlertRules: new ListAlertRulesUseCase(alertRuleRepository),
  listIncidents: new ListIncidentsUseCase(incidentRepository),
});
const alertingRouter = createIncidentAlertingRouter(incidentAlertingController);
const notificationRepository = new SqliteNotificationRepository(sqlite.session);
const notificationAttemptRepository = new SqliteNotificationAttemptRepository(sqlite.session);
const notificationDestinationRepository = new SqliteNotificationDestinationRepository(
  sqlite.session,
);
const notificationReceiptRepository = new SqliteNotificationEventReceiptRepository(sqlite.session);
const createNotificationsFromIncidentEvent = new CreateNotificationsFromIncidentEventUseCase(
  notificationRepository,
  notificationDestinationRepository,
  notificationReceiptRepository,
  new NotificationPolicy(),
  unitOfWork,
  idGenerator,
  clock,
  environment.NOTIFICATION_MAX_ATTEMPTS,
);
const notificationDispatcher = new NotificationDispatcher(
  new NotificationChannelRegistry([
    new WebhookNotificationChannel({
      allowHttp: environment.NODE_ENV === 'test' || environment.NOTIFICATION_WEBHOOK_ALLOW_HTTP,
      timeoutMs: environment.NOTIFICATION_WEBHOOK_TIMEOUT_MS,
    }),
    new EvolutionApiWhatsAppNotificationChannel({
      allowHttp: environment.NODE_ENV === 'test' || environment.NOTIFICATION_WHATSAPP_ALLOW_HTTP,
      timeoutMs: environment.NOTIFICATION_WHATSAPP_TIMEOUT_MS,
      maxTextLength: environment.NOTIFICATION_WHATSAPP_MAX_TEXT_LENGTH,
    }),
    new DisabledTelegramNotificationChannel(),
    new DisabledEmailNotificationChannel(),
  ]),
  new NotificationTemplateRenderer(),
  new EnvironmentNotificationCredentialProvider(),
);
const dispatchPendingNotification = new DispatchPendingNotificationUseCase(
  notificationRepository,
  notificationAttemptRepository,
  notificationDestinationRepository,
  notificationDispatcher,
  new NotificationRetryPolicy(environment.NOTIFICATION_MAX_ATTEMPTS),
  unitOfWork,
  idGenerator,
  clock,
);
const notificationsController = new NotificationsController({
  cancelNotification: new CancelNotificationUseCase(notificationRepository, clock),
  createDestination: new CreateNotificationDestinationUseCase(
    notificationDestinationRepository,
    idGenerator,
    clock,
  ),
  deleteDestination: new DeleteNotificationDestinationUseCase(notificationDestinationRepository),
  getNotification: new GetNotificationUseCase(
    notificationRepository,
    notificationAttemptRepository,
  ),
  listDestinations: new ListNotificationDestinationsUseCase(notificationDestinationRepository),
  listNotifications: new ListNotificationsUseCase(notificationRepository),
  retryNotification: new RetryNotificationUseCase(notificationRepository, clock),
  updateDestination: new UpdateNotificationDestinationUseCase(
    notificationDestinationRepository,
    clock,
  ),
});
const notificationsRouter = createNotificationsRouter(notificationsController);
const recordObservationBatch = new RecordObservationBatchUseCase(
  observationRepository,
  equipmentStateRepository,
  monitoringInventoryReader,
  idGenerator,
  alertEvaluator,
  { error: (details) => logger.error(details) },
);
const monitoringController = new MonitoringController(
  recordObservationBatch,
  new GetLatestStateUseCase(equipmentStateRepository, monitoringInventoryReader),
  new GetTimeSeriesUseCase(observationRepository, monitoringInventoryReader),
  new GetTopologyStateUseCase(
    equipmentStateRepository,
    new SqliteNetworkReaderAdapter(sqlite.connection),
  ),
);
const monitoringRouter = createMonitoringRouter(monitoringController);
const monitoringTargetResolver = new InventoryMonitoringTargetResolver();
const pingProbe = new SystemPingProbe();
const pingCollector = new PingCollector(
  {
    idGenerator,
    probe: pingProbe,
    targetResolver: monitoringTargetResolver,
  },
  { clock, timeoutMs: environment.MONITORING_PING_TIMEOUT_MS },
);
const monitoringCredentialProvider = new EnvironmentMonitoringCredentialProvider({
  community: environment.MONITORING_SNMP_COMMUNITY,
  retries: environment.MONITORING_SNMP_RETRIES,
  timeoutMs: environment.MONITORING_SNMP_TIMEOUT_MS,
});
const snmpCollector = new SnmpCollector(
  {
    credentialProvider: monitoringCredentialProvider,
    idGenerator,
    probe: new SystemSnmpProbe(),
    targetResolver: monitoringTargetResolver,
  },
  { clock },
);
const routerOsCredentialProvider = new EnvironmentRouterOsCredentialProvider({
  host: environment.MONITORING_ROUTEROS_HOST,
  password: environment.MONITORING_ROUTEROS_PASSWORD,
  port: environment.MONITORING_ROUTEROS_PORT,
  timeoutMs: environment.MONITORING_ROUTEROS_TIMEOUT_MS,
  tls: environment.MONITORING_ROUTEROS_TLS,
  username: environment.MONITORING_ROUTEROS_USERNAME,
});
const routerOsCollector = new RouterOsCollector(
  {
    client: new SystemRouterOsClient(),
    credentialProvider: routerOsCredentialProvider,
    idGenerator,
  },
  { clock },
);

const monitoringWorker = new MonitoringWorker(
  {
    collectors: new CollectorRegistry([
      pingCollector,
      snmpCollector,
      routerOsCollector,
      new NoOpCollector(),
    ]),
    inventory: monitoringInventoryReader,
    recordObservations: recordObservationBatch,
    observationPriorityPolicy: new SourcePriorityObservationPolicy(),
  },
  { clock },
);
const monitoringWorkerHost = new WorkerHost(
  [monitoringWorker],
  new SqliteWorkLeaseRepository(sqlite.session),
  new SqliteWorkerStatisticsRepository(sqlite.session),
  `monitoring-${process.pid}`,
);
const notificationWorkerId = `notifications-${process.pid}`;
const notificationWorkerHost = new WorkerHost(
  [
    new OutboxWorker(new SqliteOutboxWorkRepository(sqlite.session), clock),
    new NotificationOutboxWorker(
      new SqliteNotificationOutboxWorkRepository(sqlite.session),
      new NotificationEventHandler(createNotificationsFromIncidentEvent),
      clock,
      {},
      { error: (details) => logger.error(details) },
    ),
    new NotificationDispatchWorker(
      notificationRepository,
      dispatchPendingNotification,
      clock,
      { error: (details) => logger.error(details) },
      {
        batchSize: environment.NOTIFICATION_WORKER_BATCH_SIZE,
        leaseDurationSeconds: environment.NOTIFICATION_WORKER_LEASE_SECONDS,
        workerId: notificationWorkerId,
      },
    ),
  ],
  new SqliteWorkLeaseRepository(sqlite.session),
  new SqliteWorkerStatisticsRepository(sqlite.session),
  notificationWorkerId,
  {
    idleDelayMs: environment.NOTIFICATION_WORKER_INTERVAL_MS,
    leaseDurationMs: environment.NOTIFICATION_WORKER_LEASE_SECONDS * 1_000,
    leaseRenewalMs: Math.max(1_000, environment.NOTIFICATION_WORKER_LEASE_SECONDS * 500),
  },
  clock,
);
const clientsController = new ClientsController({
  archiveClient: new ArchiveClient(clientRepository, companyContext, clock),
  createClient: new CreateClient(
    clientRepository,
    companyContext,
    idGenerator,
    clock,
    outbox,
    unitOfWork,
  ),
  getClient: new GetClient(clientRepository, companyContext),
  listClients: new ListClients(clientRepository, companyContext),
  updateClient: new UpdateClient(clientRepository, companyContext, clock),
});
const clientsRouter = createClientsRouter(clientsController);
const clientBillingReader = new ClientBillingReaderAdapter(clientRepository);
const billingController = new BillingController({
  getClientAccountSummary: new GetClientAccountSummary(
    clientBillingReader,
    billingInvoiceRepository,
    billingPaymentRepository,
    billingPaymentRepository,
    billingSettings,
    companyContext,
    clock,
  ),
  listPayments: new ListPayments(billingPaymentRepository, companyContext),
  recordPayment: new RecordPayment(
    billingPaymentRepository,
    billingPaymentRepository,
    billingPaymentRepository,
    billingInvoiceRepository,
    billingPaymentRepository,
    clientBillingReader,
    billingSettings,
    outbox,
    unitOfWork,
    companyContext,
    billingActorContext,
    idGenerator,
    clock,
  ),
});
const billingRouter = createBillingRouter(billingController);
const plansController = new PlansController({
  createPlan: new CreatePlan(
    planRepository,
    companyContext,
    idGenerator,
    clock,
    outbox,
    unitOfWork,
  ),
  listPlans: new ListPlans(planReader, companyContext),
  revisePlan: new RevisePlan(
    planRepository,
    companyContext,
    idGenerator,
    clock,
    outbox,
    unitOfWork,
  ),
});
const plansRouter = createPlansRouter(plansController);
const servicesController = new ServicesController({
  createService: new CreateService(
    serviceRepository,
    clientRepository,
    companyContext,
    idGenerator,
    clock,
    outbox,
    unitOfWork,
  ),
  getService: new GetService(serviceRepository, companyContext),
  listClientServices: new ListClientServices(serviceRepository, companyContext),
});
const servicesRouter = createServicesRouter(servicesController);
const provisioningController = new ProvisioningController({
  getOperation: new GetProvisioningOperation(provisioningRepository, companyContext),
  requestOperation: new RequestProvisioningOperation(
    provisioningRepository,
    provisioningRepository,
    new ServiceReaderProvisioningAdapter(serviceRepository),
    outbox,
    unitOfWork,
    companyContext,
    actorContext,
    idGenerator,
    clock,
    provisioningRetryPolicy,
  ),
});
const provisioningRouter = createProvisioningRouter(provisioningController);
const server = createServer(
  createApp(
    {
      alertingRouter,
      billingRouter,
      clientsRouter,
      dashboardRouter,
      equipmentRouter,
      monitoringRouter,
      notificationsRouter,
      plansRouter,
      provisioningRouter,
      servicesRouter,
    },
    {
      apiPrefix: environment.API_PREFIX,
      corsAllowedOrigins: environment.CORS_ALLOWED_ORIGINS,
    },
  ),
);

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ action: 'server.shutdown.started', module: 'server', signal });

  const forceShutdownTimer = setTimeout(() => {
    logger.error({ action: 'server.shutdown.timeout', module: 'server', signal });
    process.exit(1);
  }, shutdownTimeoutMs);

  forceShutdownTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceShutdownTimer);

    if (error !== undefined) {
      logger.error({
        action: 'server.shutdown.failed',
        errorName: error.name,
        module: 'server',
        signal,
      });
      process.exit(1);
    }

    try {
      if (environment.NOTIFICATION_WORKER_ENABLED) await notificationWorkerHost.stop();
      await monitoringWorkerHost.stop();
      await sqlite.close();
      logger.info({ action: 'server.shutdown.completed', module: 'server', signal });
      process.exit(0);
    } catch (databaseError) {
      logger.error({
        action: 'server.database.close.failed',
        errorName: databaseError instanceof Error ? databaseError.name : 'UnknownError',
        module: 'server',
        signal,
      });
      process.exit(1);
    }
  });
}

server.on('error', (error) => {
  logger.error({
    action: 'server.error',
    errorCode: 'code' in error ? error.code : undefined,
    errorName: error.name,
    module: 'server',
  });
  process.exitCode = 1;
});

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

server.listen(environment.PORT, () => {
  if (environment.NOTIFICATION_WORKER_ENABLED) {
    void notificationWorkerHost.start().catch((error: unknown) => {
      logger.error({
        action: 'notification.workers.start.failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
        module: 'notifications',
      });
    });
  }
  logger.info({
    action: 'server.started',
    module: 'server',
    port: environment.PORT,
  });
});
