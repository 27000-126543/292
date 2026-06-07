import { Router, Request, Response } from 'express';
import { dispatchService } from '../services/dispatch';
import { z } from 'zod';

const router = Router();

const createDispatchSchema = z.object({
  transactionId: z.string().optional(),
  generatorId: z.string(),
  plantId: z.string(),
  targetOutput: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  issuedBy: z.string()
});

const updateExecutionSchema = z.object({
  actualOutput: z.number(),
  status: z.enum(['executing', 'completed', 'failed', 'violated'])
});

router.post('/', (req: Request, res: Response) => {
  try {
    const validated = createDispatchSchema.parse(req.body);
    const instruction = dispatchService.createInstruction(validated);
    res.json({ success: true, data: instruction });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/:id/send', (req: Request, res: Response) => {
  try {
    const instruction = dispatchService.sendToPlant(req.params.id);
    res.json({ success: true, data: instruction });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/:id/acknowledge', (req: Request, res: Response) => {
  try {
    const instruction = dispatchService.acknowledgeInstruction(req.params.id);
    res.json({ success: true, data: instruction });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/:id/execute', (req: Request, res: Response) => {
  try {
    const validated = updateExecutionSchema.parse(req.body);
    const instruction = dispatchService.updateExecution(req.params.id, validated);
    res.json({ success: true, data: instruction });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { plantId, generatorId, status } = req.query;
    const instructions = dispatchService.getInstructions({
      plantId: plantId as string,
      generatorId: generatorId as string,
      status: status as string
    });
    res.json({ success: true, data: instructions });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/violations', (req: Request, res: Response) => {
  try {
    const violations = dispatchService.getViolations();
    res.json({ success: true, data: violations });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/penalty-summary/:plantId', (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const summary = dispatchService.getPenaltySummary(
      req.params.plantId,
      startDate as string || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
      endDate as string || new Date().toISOString().split('T')[0]
    );
    res.json({ success: true, data: summary });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const instruction = dispatchService.getInstructionById(req.params.id);
    if (!instruction) {
      return res.status(404).json({ success: false, error: '调度指令不存在' });
    }
    res.json({ success: true, data: instruction });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export const dispatchRouter = router;
