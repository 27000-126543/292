import { Router, Request, Response } from 'express';
import { carbonService } from '../services/carbon';
import { z } from 'zod';

const router = Router();

const createAccountSchema = z.object({
  plantId: z.string(),
  ownerId: z.string(),
  period: z.string(),
  quota: z.number().nonnegative()
});

const addEmissionSchema = z.object({
  accountId: z.string(),
  emissionAmount: z.number().nonnegative()
});

const tradeSchema = z.object({
  accountId: z.string(),
  type: z.enum(['buy', 'sell']),
  amount: z.number().positive(),
  price: z.number().positive()
});

router.post('/account', (req: Request, res: Response) => {
  try {
    const validated = createAccountSchema.parse(req.body);
    const account = carbonService.createAccount(validated);
    res.json({ success: true, data: account });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/emission', (req: Request, res: Response) => {
  try {
    const validated = addEmissionSchema.parse(req.body);
    const account = carbonService.addEmission(validated);
    res.json({ success: true, data: account });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/trade', (req: Request, res: Response) => {
  try {
    const validated = tradeSchema.parse(req.body);
    const account = carbonService.executeTrade(validated);
    res.json({ success: true, data: account });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { plantId, period } = req.query;
    const accounts = carbonService.getAccounts({
      plantId: plantId as string,
      period: period as string
    });
    res.json({ success: true, data: accounts });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const account = carbonService.getAccountById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, error: '碳账户不存在' });
    }
    res.json({ success: true, data: account });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/price/current', (req: Request, res: Response) => {
  try {
    const price = carbonService.getCarbonPrice();
    res.json({ success: true, data: { price, unit: '元/吨' } });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/compliance/:accountId', (req: Request, res: Response) => {
  try {
    const report = carbonService.generateComplianceReport(req.params.accountId);
    res.json({ success: true, data: report });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/emission/calculate/:plantId', (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const emission = carbonService.calculatePlantEmission(
      req.params.plantId,
      startDate as string || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      endDate as string || new Date().toISOString().split('T')[0]
    );
    res.json({ success: true, data: { emission, unit: '吨CO2' } });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export const carbonRouter = router;
