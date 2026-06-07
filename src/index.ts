import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { initDatabase } from './database/init';
import { wsService } from './services/websocket';
import { dispatchService } from './services/dispatch';
import { crossBorderService } from './services/crossBorder';

import { biddingRouter } from './routes/bidding';
import { tradingRouter } from './routes/trading';
import { dispatchRouter } from './routes/dispatch';
import { crossBorderRouter } from './routes/crossBorder';
import { settlementRouter } from './routes/settlement';
import { renewableRouter } from './routes/renewable';
import { carbonRouter } from './routes/carbon';
import { alertRouter } from './routes/alert';
import { errorHandler, notFoundHandler } from './middleware';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: '智慧跨境电力交易与电网调度系统',
    version: '1.0.0',
    wsClients: wsService.getClientCount()
  });
});

app.get('/api/docs', (req, res) => {
  res.json({
    name: '智慧跨境电力交易与电网调度系统 API',
    version: '1.0.0',
    endpoints: {
      bidding: {
        'GET /api/bidding/strategy/:generatorId': '获取报价策略推荐',
        'POST /api/bidding/submit': '提交报价（自动校验容量、超限自动拆分）',
        'GET /api/bidding/owner/:ownerId': '获取发电商报价列表',
        'GET /api/bidding/:id': '获取报价详情'
      },
      trading: {
        'POST /api/trading/clear/:tradingDate': '执行市场出清（计算节点电价、成交电量、过载再调度）',
        'GET /api/trading/transactions': '获取交易列表',
        'GET /api/trading/transactions/:id': '获取交易详情',
        'GET /api/trading/lines': '获取输电线路状态'
      },
      dispatch: {
        'POST /api/dispatch': '创建调度指令',
        'POST /api/dispatch/:id/send': '下发调度指令',
        'POST /api/dispatch/:id/acknowledge': '确认调度指令',
        'POST /api/dispatch/:id/execute': '更新执行状态（偏差自动告警扣分）',
        'GET /api/dispatch': '获取调度指令列表',
        'GET /api/dispatch/violations': '获取违规记录',
        'GET /api/dispatch/penalty-summary/:plantId': '获取考核扣分汇总'
      },
      crossBorder: {
        'POST /api/cross-border/initiate': '发起跨境交易安全校核',
        'POST /api/cross-border/process': '处理区域校核（超时自动升级）',
        'GET /api/cross-border': '获取校核记录列表',
        'GET /api/cross-border/:id': '获取校核详情'
      },
      settlement: {
        'POST /api/settlement/daily/:plantId/:date': '计算日结算单',
        'POST /api/settlement/monthly/:plantId/:yearMonth': '计算月结算单',
        'POST /api/settlement/:id/confirm': '确认结算单',
        'GET /api/settlement': '获取结算单列表'
      },
      renewable: {
        'POST /api/renewable/forecast': '创建新能源预测',
        'POST /api/renewable/forecast/generate-day-ahead/:generatorId/:date': '生成日前预测',
        'POST /api/renewable/actual': '更新实际出力（超阈值自动调储能）',
        'GET /api/renewable': '获取预测列表',
        'GET /api/renewable/storage/:region': '获取区域可用储能'
      },
      carbon: {
        'POST /api/carbon/account': '创建碳账户',
        'POST /api/carbon/emission': '登记碳排放',
        'POST /api/carbon/trade': '执行碳配额交易',
        'GET /api/carbon': '获取碳账户列表',
        'GET /api/carbon/price/current': '获取当前碳价',
        'GET /api/carbon/compliance/:accountId': '生成履约报告'
      },
      alerts: {
        'GET /api/alerts': '获取告警列表',
        'POST /api/alerts/:id/acknowledge': '确认告警',
        'GET /api/alerts/ws/status': '获取WebSocket连接状态'
      }
    },
    websocket: {
      port: config.websocket.port,
      events: ['bid_submitted', 'market_cleared', 'dispatch_update', 'alert', 'settlement_calculated', 'carbon_trade_executed']
    }
  });
});

app.use('/api/bidding', biddingRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/dispatch', dispatchRouter);
app.use('/api/cross-border', crossBorderRouter);
app.use('/api/settlement', settlementRouter);
app.use('/api/renewable', renewableRouter);
app.use('/api/carbon', carbonRouter);
app.use('/api/alerts', alertRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export function startServer() {
  initDatabase();
  console.log('Database initialized');

  wsService.start();
  console.log('WebSocket service started');

  dispatchService.startMonitor();

  setInterval(() => {
    crossBorderService.checkPendingTimeouts();
  }, 30000);

  const server = app.listen(config.port, () => {
    console.log(`========================================`);
    console.log(`智慧跨境电力交易与电网调度系统`);
    console.log(`API Server: http://localhost:${config.port}`);
    console.log(`WebSocket:  ws://localhost:${config.websocket.port}`);
    console.log(`API Docs:    http://localhost:${config.port}/api/docs`);
    console.log(`Health:      http://localhost:${config.port}/health`);
    console.log(`========================================`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

export default app;
