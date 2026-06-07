import { Router, Request, Response } from 'express';
import { biddingService } from '../services/bidding';
import { z } from 'zod';

const router = Router();

const submitBidSchema = z.object({
  generatorId: z.string(),
  plantId: z.string(),
  ownerId: z.string(),
  tradingDate: z.string(),
  tradingHour: z.number().int().min(0).max(23),
  capacity: z.number().positive(),
  price: z.number().positive()
});

router.get('/strategy/:generatorId', async (req: Request, res: Response) => {
  try {
    const { generatorId } = req.params;
    const { tradingDate, tradingHour } = req.query;
    
    const date = tradingDate as string || new Date().toISOString().split('T')[0];
    const hour = parseInt(tradingHour as string) || new Date().getHours();
    
    const strategy = await biddingService.recommendStrategy(generatorId, date, hour);
    res.json({ success: true, data: strategy });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/submit', async (req: Request, res: Response) => {
  try {
    const validated = submitBidSchema.parse(req.body);
    const result = biddingService.validateAndSubmitBid(validated);
    res.json({ success: result.success, data: result, warnings: result.warnings });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/owner/:ownerId', (req: Request, res: Response) => {
  try {
    const bids = biddingService.getBidsByOwner(req.params.ownerId);
    res.json({ success: true, data: bids });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const bid = biddingService.getBidById(req.params.id);
    if (!bid) {
      return res.status(404).json({ success: false, error: '报价不存在' });
    }
    res.json({ success: true, data: bid });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { tradingDate, status } = req.query;
    if (status === 'pending' && tradingDate) {
      const bids = biddingService.getPendingBids(tradingDate as string);
      return res.json({ success: true, data: bids });
    }
    res.json({ success: true, data: biddingService.getGenerators() });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export const biddingRouter = router;
