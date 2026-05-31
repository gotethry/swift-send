import type { FastifyInstance } from 'fastify';
import { verifyReceiptToken } from '../modules/receipts/receiptService';

export default async function receiptRoutes(fastify: FastifyInstance) {
  fastify.get('/verify/receipt/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const payload = verifyReceiptToken(token);
    if (!payload) {
      return reply.code(200).send({ result: 'tampered_or_expired' });
    }

    // Lookup transfer
    const transfer = await fastify.container.services.transfers.getTransfer(payload.transactionId ?? '');
    if (!transfer) return reply.code(200).send({ result: 'not_found' });

    // Check on-chain/ledger state
    const validStates = ['settled', 'submitted'];
    if (!validStates.includes(transfer.state)) return reply.code(200).send({ result: 'not_settled' });

    return { result: 'valid', transferId: transfer.id, state: transfer.state };
  });
}
