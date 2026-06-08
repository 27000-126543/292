import { Router, Request, Response } from 'express';
import { alertModel } from '../models/operations';
import { wsService } from '../services/websocket';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const { role, ownerId, limit } = req.query;
    let alerts;
    
    if (role && ownerId) {
      alerts = alertModel.findByRoleAndOwner(role as string, ownerId as string);
    } else if (role) {
      alerts = alertModel.findByRole(role as string);
    } else {
      alerts = alertModel.findAll(parseInt(limit as string) || 100);
    }
    
    res.json({ success: true, data: alerts });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const alert = alertModel.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, error: '告警不存在' });
    }
    res.json({ success: true, data: alert });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/:id/acknowledge', (req: Request, res: Response) => {
  try {
    alertModel.acknowledge(req.params.id);
    res.json({ success: true, message: '告警已确认' });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/ws/status', (req: Request, res: Response) => {
  try {
    const count = wsService.getClientCount();
    res.json({ success: true, data: { connectedClients: count } });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export const alertRouter = router;
