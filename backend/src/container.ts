import { config, AppConfig } from "./config";
import { EventBus } from "./core/eventBus";
import { ActivityService } from "./modules/activity/activityService";
import { ExportService } from "./modules/activity/exportService";
import { ComplianceService } from "./modules/compliance/complianceService";
import { CountryMetadataService } from "./modules/countries/countryMetadataService";
import { FraudService } from "./modules/fraud/fraudService";
import { FraudReviewService } from "./modules/fraud/fraudReviewService";
import { createDemoNotifications } from "./modules/notifications/demoNotifications";
import { NotificationService } from "./modules/notifications/notificationService";
import { AccessGuardService } from "./modules/rbac/accessGuardService";
import { SystemHealthService } from "./modules/system/systemHealthService";
import { createDemoTransfers } from "./modules/transfers/demoTransfers";
import { InMemoryTransferRepository } from "./modules/transfers/inMemoryTransferRepository";
import { TransferQueue } from "./modules/transfers/transferQueue";
import { TransferLifecycle } from "./modules/transfers/transferLifecycle";
import { WalletService } from "./modules/wallets/walletService";
import { ContractService } from "./services/contractService";
import { RecurringPaymentService } from "./modules/recurring-payments/recurringPaymentService";
import { RecurringPaymentWorker } from "./modules/recurring-payments/recurringPaymentWorker";
import { InMemoryRecurringPaymentRepository } from "./modules/recurring-payments/inMemoryRecurringPaymentRepository";
import { ComplianceLogService } from "./modules/compliance/complianceLogService";
import { AuditStorageService } from "./modules/compliance/auditStorageService";
import { ReconciliationService } from "./modules/reconciliation/reconciliationService";
import { StressTestService } from "./modules/stress/stressTestService";
import { ErrorLogService } from "./modules/system/errorLogService";
import { StellarFeeService } from "./services/stellarFeeService";
import { registerTransferEventHandlers } from "./modules/transfers/transferEventHandlers";
import { DeadLetterQueue } from "./modules/transfers/deadLetterQueue";
import { StellarMonitorService } from "./modules/system/stellarMonitorService";
import { AuthRiskEngine } from "./auth/riskEngine";
import { SettlementAnalyticsService } from "./modules/transfers/settlementAnalyticsService";
import { AdminAlertService } from "./modules/system/adminAlertService";
import { OperationalMetricsService } from "./modules/system/operationalMetricsService";
import { TransactionApprovalService } from "./modules/approvals/approvalService";
import { SuccessRateService } from "./modules/transfers/successRateService";
import { RegionalFeeService } from "./modules/fees/regionalFeeService";
import { securityEventsService } from "./modules/securityEvents/securityEventsService";
import { receiptService } from "./modules/receipts/receiptService";
import { WebhookDispatcher } from "./modules/webhooks/webhookDispatcher";

export interface AppContainer {
  config: AppConfig;
  eventBus: EventBus;
  services: {
    transfers: TransferLifecycle;
    transferQueue: TransferQueue;
    wallets: WalletService;
    countryMetadata: CountryMetadataService;
    compliance: ComplianceService;
    complianceLog: ComplianceLogService;
    fraud: FraudService;
    notifications: NotificationService;
    notification: NotificationService;
    activity: ActivityService;
    health: SystemHealthService;
    contracts: ContractService;
    accessGuard: AccessGuardService;
    recurringPayments: RecurringPaymentService;
    errorLog: ErrorLogService;
    stellarFee: StellarFeeService;
    adminAlerts: AdminAlertService;
    operationalMetrics: OperationalMetricsService;
    auditStorage: AuditStorageService;
    authRiskEngine: AuthRiskEngine;
    deadLetterQueue: DeadLetterQueue;
    settlementAnalytics: SettlementAnalyticsService;
    stellarMonitor: StellarMonitorService;
    transactionApproval: TransactionApprovalService;
    successRate: SuccessRateService;
    regionalFee: RegionalFeeService;
    securityEvents: typeof securityEventsService;
    receipts: typeof receiptService;
    webhooks: WebhookDispatcher;
  };
}

export function createContainer(): AppContainer {
  const eventBus = new EventBus();
  const compliance = new ComplianceService();
  const fraud = new FraudService();
  const wallets = new WalletService();
  const contracts = new ContractService();
  const countryMetadata = new CountryMetadataService();
  const transferRepository = new InMemoryTransferRepository(
    createDemoTransfers(),
  );
  const notifications = new NotificationService(
    eventBus,
    createDemoNotifications(),
  );
  const exporter = new ExportService();
  const activity = new ActivityService(
    transferRepository,
    notifications,
    exporter,
  );
  const fraudReview = new FraudReviewService();
  const transfers = new TransferLifecycle(
    transferRepository,
    wallets,
    compliance,
    fraud,
    eventBus,
    fraudReview,
  );
  const deadLetterQueue = new DeadLetterQueue(eventBus);
  const transferQueue = new TransferQueue(transfers, eventBus, deadLetterQueue);
  const health = new SystemHealthService(compliance, wallets);
  const accessGuard = new AccessGuardService();
  const recurringPaymentRepository = new InMemoryRecurringPaymentRepository();
  const recurringPayments = new RecurringPaymentService(
    recurringPaymentRepository,
    contracts,
  );
  const recurringWorker = new RecurringPaymentWorker(recurringPayments);
  const complianceLog = new ComplianceLogService(eventBus);
  const auditStorage = new AuditStorageService(eventBus);
  const reconciliation = new ReconciliationService(transferRepository);
  const stressTest = new StressTestService(transfers);
  const errorLog = new ErrorLogService(eventBus);
  const stellarFee = new StellarFeeService();
  const stellarMonitor = new StellarMonitorService(errorLog);
  const authRiskEngine = new AuthRiskEngine(eventBus);
  const settlementAnalytics = new SettlementAnalyticsService(eventBus);
  const adminAlerts = new AdminAlertService(eventBus);
  const operationalMetrics = new OperationalMetricsService();
  const transactionApproval = new TransactionApprovalService();
  const successRate = new SuccessRateService();
  const regionalFee = new RegionalFeeService();

  // Additional services
  const securityEvents = securityEventsService; // singleton
  const receipts = receiptService; // singleton
  const webhookDispatcher = new WebhookDispatcher(eventBus);

  recurringWorker.start();
  stellarMonitor.start();

  registerTransferEventHandlers({
    eventBus,
    activity,
    compliance,
    fraud,
    notifications,
  });
  eventBus.subscribe<{ logId: string; userId: string; checkType: string; status: string; riskScore: number }>(
    "compliance.log_created",
    async (event) => {
      const log = complianceLog.getAllLogs({ checkType: event.payload.checkType as any, limit: 1 });
      if (log.length > 0) {
        await auditStorage.storeAuditRecord(log[0]);
      }
    },
  );

  eventBus.subscribe<{ userId: string }>(
    "notification.created",
    async (event) => {
      await activity.invalidateUser(event.payload.userId);
    },
  );
  eventBus.subscribe<{ userId: string }>("notification.read", async (event) => {
    await activity.invalidateUser(event.payload.userId);
  });

  return {
    config,
    eventBus,
    services: {
      transfers,
      transferQueue,
      wallets,
      countryMetadata,
      compliance,
      complianceLog,
      fraud,
    fraudReview,
      notification: notifications,
      activity,
      health,
      contracts,
      accessGuard,
      recurringPayments,
      errorLog,
      stellarFee,
      adminAlerts,
      operationalMetrics,
      auditStorage,
      authRiskEngine,
      deadLetterQueue,
      settlementAnalytics,
      stellarMonitor,
      transactionApproval,
      successRate,
      regionalFee,
      securityEvents,
      receipts,
      webhooks: webhookDispatcher,

    },
  };
}
