import { Router, Request, Response } from 'express';
import { settlementService } from '../services/settlement';

const router = Router();

router.post('/daily/:plantId/:date', (req: Request, res: Response) => {
  try {
    const { plantId, date } = req.params;
    const settlement = settlementService.calculateDailySettlement(plantId, date);
    res.json({ success: true, data: settlement });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/monthly/:plantId/:yearMonth', (req: Request, res: Response) => {
  try {
    const { plantId, yearMonth } = req.params;
    const settlement = settlementService.calculateMonthlySettlement(plantId, yearMonth);
    res.json({ success: true, data: settlement });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/:id/confirm', (req: Request, res: Response) => {
  try {
    const settlement = settlementService.confirmSettlement(req.params.id);
    res.json({ success: true, data: settlement });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/:id/paid', (req: Request, res: Response) => {
  try {
    const settlement = settlementService.markPaid(req.params.id);
    res.json({ success: true, data: settlement });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { plantId, periodType } = req.query;
    const settlements = settlementService.getSettlements({
      plantId: plantId as string,
      periodType: periodType as 'daily' | 'monthly' | undefined
    });
    res.json({ success: true, data: settlements });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const settlement = settlementService.getSettlementById(req.params.id);
    if (!settlement) {
      return res.status(404).json({ success: false, error: '结算单不存在' });
    }
    res.json({ success: true, data: settlement });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export const settlementRouter = router;
