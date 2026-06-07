import { Router, Request, Response } from 'express';
import { crossBorderService } from '../services/crossBorder';
import { z } from 'zod';

const router = Router();

const initiateCheckSchema = z.object({
  transactionId: z.string(),
  fromRegion: z.string(),
  toRegion: z.string(),
  intermediateRegions: z.array(z.string()).optional()
});

const processCheckSchema = z.object({
  checkId: z.string(),
  region: z.string(),
  status: z.enum(['approved', 'rejected']),
  checker: z.string(),
  comment: z.string().optional()
});

router.post('/initiate', (req: Request, res: Response) => {
  try {
    const validated = initiateCheckSchema.parse(req.body);
    const check = crossBorderService.initiateCheck(validated);
    res.json({ success: true, data: check });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/process', (req: Request, res: Response) => {
  try {
    const validated = processCheckSchema.parse(req.body);
    const check = crossBorderService.processCheck(validated);
    res.json({ success: true, data: check });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const checks = crossBorderService.getAllChecks();
    res.json({ success: true, data: checks });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const check = crossBorderService.getCheckById(req.params.id);
    if (!check) {
      return res.status(404).json({ success: false, error: '校核记录不存在' });
    }
    res.json({ success: true, data: check });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/transaction/:transactionId', (req: Request, res: Response) => {
  try {
    const check = crossBorderService.getCheckByTransaction(req.params.transactionId);
    if (!check) {
      return res.status(404).json({ success: false, error: '该交易暂无校核记录' });
    }
    res.json({ success: true, data: check });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export const crossBorderRouter = router;
