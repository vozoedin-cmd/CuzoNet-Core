import type { RequestHandler } from 'express';
import type { GetClientAccountSummary } from '../../../application/use-cases/billing/accounts/get-client-account-summary/get-client-account-summary.use-case.js';
import type { ListPayments } from '../../../application/use-cases/billing/payments/list-payments/list-payments.use-case.js';
import type { RecordPayment } from '../../../application/use-cases/billing/payments/record-payment/record-payment.use-case.js';
import {
  parseBillingClientParams,
  parseBillingIdempotencyKey,
  parsePaymentListQuery,
  parsePaymentRequest,
} from '../validators/billing-request.schemas.js';
export interface BillingControllerDependencies {
  getClientAccountSummary: GetClientAccountSummary;
  listPayments: ListPayments;
  recordPayment: RecordPayment;
}
export class BillingController {
  public constructor(private readonly dependencies: BillingControllerDependencies) {}
  public readonly recordPayment: RequestHandler = async (request, response, next) => {
    try {
      const body = parsePaymentRequest(request.body);
      const idempotencyKey = parseBillingIdempotencyKey(request.get('Idempotency-Key'));
      const payment = await this.dependencies.recordPayment.execute({
        ...(body.allocations === undefined ? {} : { allocations: body.allocations }),
        amountCents: body.amountCents,
        causationId: idempotencyKey,
        clientId: body.clientId,
        correlationId: request.correlationId,
        currencyCode: body.currencyCode,
        ...(body.externalReference === undefined
          ? {}
          : { externalReference: body.externalReference }),
        idempotencyKey,
        method: body.method,
        receivedAt: body.receivedAt,
      });
      response.status(201).json(payment);
    } catch (error) {
      next(error);
    }
  };
  public readonly listPayments: RequestHandler = async (request, response, next) => {
    try {
      const query = parsePaymentListQuery(request.query);
      response
        .status(200)
        .json(
          await this.dependencies.listPayments.execute({
            page: query.page,
            pageSize: query.pageSize,
            ...(query.clientId === undefined ? {} : { clientId: query.clientId }),
            ...(query.from === undefined ? {} : { from: query.from }),
            ...(query.to === undefined ? {} : { to: query.to }),
          }),
        );
    } catch (error) {
      next(error);
    }
  };
  public readonly getClientAccountSummary: RequestHandler = async (request, response, next) => {
    try {
      const { clientId } = parseBillingClientParams(request.params);
      response.status(200).json(await this.dependencies.getClientAccountSummary.execute(clientId));
    } catch (error) {
      next(error);
    }
  };
}
