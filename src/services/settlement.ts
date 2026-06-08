import { settlementModel, dispatchModel } from '../models/operations';
import { transactionModel } from '../models/trading';
import type { Settlement, SettlementItem } from '../types';
import { roundTo, formatDate } from '../utils';
import { wsService } from './websocket';
import { config } from '../config';

const PENALTY_RULES = `
偏差考核费规则：
1. 偏差率 ≤ 5%：不收取考核费
2. 5% < 偏差率 ≤ 10%：考核费 = (偏差率 - 5%) * 电费 * 1.5
3. 偏差率 > 10%：考核费 = (偏差率 - 5%) * 电费 * 3.0
`;

class SettlementService {
  calculateDailySettlement(plantId: string, date: string): Settlement {
    const transactions = transactionModel.findByPlant(plantId, date, date);
    const instructions = dispatchModel.findByGenerator('');
    
    const items: SettlementItem[] = [];
    let totalEnergy = 0;
    let totalRevenue = 0;
    let totalPenalty = 0;

    transactions.forEach(trans => {
      const scheduledEnergy = trans.clearedCapacity;
      const actualEnergy = this.getActualEnergy(trans.generatorId, date, trans.tradingHour, scheduledEnergy);
      const deviation = actualEnergy - scheduledEnergy;
      const deviationRatio = scheduledEnergy > 0 ? Math.abs(deviation) / scheduledEnergy : 0;
      
      const electricityFee = scheduledEnergy * trans.clearedPrice;
      const { penalty, rule } = this.calculateDeviationPenalty(deviationRatio, electricityFee);

      const amount = roundTo(actualEnergy * trans.clearedPrice, 2);
      
      items.push({
        transactionId: trans.id,
        tradingDate: trans.tradingDate,
        tradingHour: trans.tradingHour,
        scheduledEnergy: roundTo(scheduledEnergy, 2),
        actualEnergy: roundTo(actualEnergy, 2),
        deviation: roundTo(deviation, 2),
        deviationRatio: roundTo(deviationRatio, 4),
        price: trans.clearedPrice,
        amount,
        penalty: roundTo(penalty, 2),
        penaltyRule: rule
      });

      totalEnergy += actualEnergy;
      totalRevenue += amount;
      totalPenalty += penalty;
    });

    const penaltySummary = dispatchModel.getPenaltySummary(plantId, date, date);
    const dispatchPenaltyDeduction = penaltySummary.basePoints * 100;
    const continuousPenaltyDeduction = (penaltySummary.continuousPenalty || 0) * 100;
    totalPenalty += dispatchPenaltyDeduction + continuousPenaltyDeduction;

    const carbonCost = this.calculateCarbonCost(plantId, date);
    const renewableCompensation = this.calculateRenewableCompensation(plantId, date);
    
    const netAmount = roundTo(totalRevenue - totalPenalty - carbonCost + renewableCompensation, 2);

    const settlement = settlementModel.create({
      plantId,
      ownerId: transactions[0]?.ownerId || 'unknown',
      period: date,
      periodType: 'daily',
      totalEnergy: roundTo(totalEnergy, 2),
      totalRevenue: roundTo(totalRevenue, 2),
      deviationPenalty: roundTo(totalPenalty, 2),
      carbonCost: roundTo(carbonCost, 2),
      renewableCompensation: roundTo(renewableCompensation, 2),
      dispatchPenaltyDeduction,
      continuousPenaltyDeduction,
      penaltyRules: PENALTY_RULES.trim(),
      netAmount,
      status: 'calculated',
      items
    });

    wsService.broadcast({
      type: 'settlement_calculated',
      payload: {
        settlement,
        date
      },
      targetRoles: ['trading_center', 'power_producer']
    });

    return settlement;
  }

  private calculateDeviationPenalty(deviationRatio: number, electricityFee: number): { penalty: number; rule: string } {
    if (deviationRatio <= config.rules.settlementPenaltyTier1Threshold) {
      return {
        penalty: 0,
        rule: `偏差率${(deviationRatio * 100).toFixed(2)}% ≤ 5%，免考核`
      };
    } else if (deviationRatio <= config.rules.settlementPenaltyTier2Threshold) {
      const penalty = (deviationRatio - config.rules.settlementPenaltyTier1Threshold) * electricityFee * config.rules.settlementPenaltyTier1Rate;
      return {
        penalty: roundTo(penalty, 2),
        rule: `偏差率${(deviationRatio * 100).toFixed(2)}%，在5%-10%区间，按(偏差率-5%)*电费*1.5计算`
      };
    } else {
      const penalty = (deviationRatio - config.rules.settlementPenaltyTier1Threshold) * electricityFee * config.rules.settlementPenaltyTier2Rate;
      return {
        penalty: roundTo(penalty, 2),
        rule: `偏差率${(deviationRatio * 100).toFixed(2)}% > 10%，按(偏差率-5%)*电费*3.0计算`
      };
    }
  }

  calculateMonthlySettlement(plantId: string, yearMonth: string): Settlement {
    const [year, month] = yearMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`;

    const transactions = transactionModel.findByPlant(plantId, startDate, endDate);
    const dailySettlements = settlementModel.findByPlant(plantId).filter(s => 
      s.periodType === 'daily' && s.period.startsWith(yearMonth)
    );

    let totalEnergy = 0;
    let totalRevenue = 0;
    let totalPenalty = 0;
    let totalCarbonCost = 0;
    let totalRenewableCompensation = 0;
    let totalDispatchDeduction = 0;
    let totalContinuousDeduction = 0;
    const allItems: SettlementItem[] = [];

    dailySettlements.forEach(ds => {
      totalEnergy += ds.totalEnergy;
      totalRevenue += ds.totalRevenue;
      totalPenalty += ds.deviationPenalty;
      totalCarbonCost += ds.carbonCost;
      totalRenewableCompensation += ds.renewableCompensation;
      totalDispatchDeduction += ds.dispatchPenaltyDeduction || 0;
      totalContinuousDeduction += ds.continuousPenaltyDeduction || 0;
      allItems.push(...ds.items);
    });

    const netAmount = roundTo(totalRevenue - totalPenalty - totalCarbonCost + totalRenewableCompensation, 2);

    const settlement = settlementModel.create({
      plantId,
      ownerId: transactions[0]?.ownerId || 'unknown',
      period: yearMonth,
      periodType: 'monthly',
      totalEnergy: roundTo(totalEnergy, 2),
      totalRevenue: roundTo(totalRevenue, 2),
      deviationPenalty: roundTo(totalPenalty, 2),
      carbonCost: roundTo(totalCarbonCost, 2),
      renewableCompensation: roundTo(totalRenewableCompensation, 2),
      dispatchPenaltyDeduction: totalDispatchDeduction,
      continuousPenaltyDeduction: totalContinuousDeduction,
      penaltyRules: PENALTY_RULES.trim(),
      netAmount,
      status: 'calculated',
      items: allItems
    });

    wsService.broadcast({
      type: 'monthly_settlement_ready',
      payload: {
        settlement,
        period: yearMonth
      },
      targetRoles: ['trading_center', 'power_producer']
    });

    return settlement;
  }

  private getActualEnergy(generatorId: string, date: string, hour: number, scheduledEnergy: number): number {
    const instructions = dispatchModel.findByGenerator(generatorId);
    const dayStart = new Date(date);
    const hourStart = new Date(dayStart.getTime() + hour * 3600000);
    const hourEnd = new Date(hourStart.getTime() + 3600000);

    const matching = instructions.find(i => {
      const startTime = new Date(i.startTime);
      return startTime >= hourStart && startTime < hourEnd && i.actualOutput !== undefined;
    });

    if (matching) {
      return matching.actualOutput!;
    }

    if (scheduledEnergy > 0) {
      const factor = 0.95 + Math.random() * 0.1;
      return roundTo(scheduledEnergy * factor, 2);
    }

    return 0;
  }

  private calculateCarbonCost(plantId: string, date: string): number {
    const transactions = transactionModel.findByPlant(plantId, date, date);
    const totalEnergy = transactions.reduce((sum, t) => sum + t.clearedCapacity, 0);
    const carbonPrice = 55;
    const emissionFactor = 0.8;
    return roundTo(totalEnergy * emissionFactor * carbonPrice * 0.01, 2);
  }

  private calculateRenewableCompensation(plantId: string, date: string): number {
    const transactions = transactionModel.findByPlant(plantId, date, date);
    let compensation = 0;
    
    transactions.forEach(t => {
      if (t.generatorId.includes('wind') || t.generatorId.includes('solar') || t.generatorId.includes('hydro')) {
        compensation += t.clearedCapacity * 20;
      }
    });

    return roundTo(compensation, 2);
  }

  confirmSettlement(id: string): Settlement {
    settlementModel.updateStatus(id, 'confirmed');
    const settlement = settlementModel.findById(id)!;

    wsService.broadcast({
      type: 'settlement_confirmed',
      payload: settlement,
      targetRoles: ['trading_center', 'power_producer']
    });

    return settlement;
  }

  markPaid(id: string): Settlement {
    settlementModel.updateStatus(id, 'paid');
    return settlementModel.findById(id)!;
  }

  getSettlements(filters?: { plantId?: string; periodType?: 'daily' | 'monthly' }): Settlement[] {
    if (filters?.plantId) {
      return settlementModel.findByPlant(filters.plantId)
        .filter(s => !filters.periodType || s.periodType === filters.periodType);
    }
    return settlementModel.findAll();
  }

  getSettlementById(id: string): Settlement | undefined {
    return settlementModel.findById(id);
  }

  getPenaltyRules(): string {
    return PENALTY_RULES.trim();
  }
}

export const settlementService = new SettlementService();
