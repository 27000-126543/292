export const config = {
  port: Number(process.env.PORT) || 3000,
  database: {
    path: process.env.DB_PATH || './data/power_trading.db'
  },
  websocket: {
    port: Number(process.env.WS_PORT) || 3001
  },
  rules: {
    deviationPenaltyRate: 0.1,
    maxContinuousViolations: 2,
    safetyCheckTimeout: 30 * 60 * 1000,
    renewableDeviationThreshold: 0.15,
    carbonQuotaWarningRatio: 0.9,
    dispatchAckTimeout: 2 * 60 * 1000,
    dispatchDeviationThreshold: 0.1,
    dispatchMonitorInterval: 10000,
    settlementPenaltyTier1Rate: 1.5,
    settlementPenaltyTier2Rate: 3.0,
    settlementPenaltyTier1Threshold: 0.05,
    settlementPenaltyTier2Threshold: 0.10,
    renewableCompensationPrice: 150,
    continuousViolationExtraPenalty: 10
  }
} as const;

export type Config = typeof config;
