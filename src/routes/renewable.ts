import { Router, Request, Response } from 'express';
import { renewableService } from '../services/renewable';
import { z } from 'zod';

const router = Router();

const createForecastSchema = z.object({
  generatorId: z.string(),
  forecastDate: z.string(),
  forecastHour: z.number().int().min(0).max(23),
  forecastOutput: z.number().nonnegative()
});

const updateActualSchema = z.object({
  forecastId: z.string(),
  actualOutput: z.number().nonnegative()
});

router.post('/forecast', (req: Request, res: Response) => {
  try {
    const validated = createForecastSchema.parse(req.body);
    const forecast = renewableService.createForecast(validated);
    res.json({ success: true, data: forecast });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/forecast/generate-day-ahead/:generatorId/:forecastDate', (req: Request, res: Response) => {
  try {
    const { generatorId, forecastDate } = req.params;
    const forecasts = renewableService.generateDayAheadForecast(generatorId, forecastDate);
    res.json({ success: true, data: forecasts });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/actual', (req: Request, res: Response) => {
  try {
    const validated = updateActualSchema.parse(req.body);
    const forecast = renewableService.updateActualOutput(validated);
    res.json({ success: true, data: forecast });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const { generatorId, startDate, exceeded } = req.query;
    const forecasts = renewableService.getForecasts({
      generatorId: generatorId as string,
      startDate: startDate as string,
      exceeded: exceeded === 'true'
    });
    res.json({ success: true, data: forecasts });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const forecast = renewableService.getForecastById(req.params.id);
    if (!forecast) {
      return res.status(404).json({ success: false, error: '预测记录不存在' });
    }
    res.json({ success: true, data: forecast });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/storage/:region', (req: Request, res: Response) => {
  try {
    const storage = renewableService.getAvailableStorage(req.params.region);
    res.json({ success: true, data: storage });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/compensation/:forecastId', (req: Request, res: Response) => {
  try {
    const result = renewableService.calculateCompensation(req.params.forecastId);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export const renewableRouter = router;
