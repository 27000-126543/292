import { Router, Request, Response } from 'express';
import { tradingEngineService } from '../services/tradingEngine';

const router = Router();

router.post('/clear/:tradingDate', async (req: Request, res: Response) => {
  try {
    const { tradingDate } = req.params;
    const result = await tradingEngineService.runMarketClearing(tradingDate);
    res.json({ 
      success: true, 
      data: {
        transactionCount: result.transactions.length,
        nodePrices: Object.fromEntries(result.nodePrices),
        overloadedLines: result.overloadedLines,
        redispatchedCount: result.redispatchedInstructions.length,
        warnings: result.warnings
      }
    });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/transactions', (req: Request, res: Response) => {
  try {
    const { plantId, startDate, endDate, isCrossBorder } = req.query;
    const transactions = tradingEngineService.getTransactions({
      plantId: plantId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      isCrossBorder: isCrossBorder === 'true'
    });
    res.json({ success: true, data: transactions });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/transactions/:id', (req: Request, res: Response) => {
  try {
    const transaction = tradingEngineService.getTransactionById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, error: '交易不存在' });
    }
    res.json({ success: true, data: transaction });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/lines', (req: Request, res: Response) => {
  try {
    const lines = tradingEngineService.getTransmissionLines();
    res.json({ success: true, data: lines });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export const tradingRouter = router;
