import { receiptService } from '../modules/receipts/receiptService';

describe('receiptService', () => {
  it('generates and verifies a token', () => {
    const txId = `tx_${Date.now()}`;
    const { token, expiresAt, transactionId } = receiptService.generateReceiptToken(txId);
    expect(transactionId).toBe(txId);
    const res = receiptService.verifyReceiptToken(token);
    expect(res.valid).toBe(true);
    expect(res.transactionId).toBe(txId);
    expect(res.isExpired).toBe(false);
  });

  it('detects tampered token', () => {
    const txId = `tx_${Date.now()}`;
    const { token } = receiptService.generateReceiptToken(txId);
    // change one character
    const tampered = token.replace(/./, (c) => (c === 'a' ? 'b' : 'a'));
    const res = receiptService.verifyReceiptToken(tampered);
    expect(res.valid).toBe(false);
  });
});
