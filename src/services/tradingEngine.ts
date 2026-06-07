import { bidModel, transactionModel, transmissionLineModel } from '../models/trading';
import { generatorModel } from '../models/generator';
import { dispatchModel } from '../models/operations';
import type { Bid, Transaction, TransmissionLine, DispatchInstruction } from '../types';
import { roundTo, addHours, now } from '../utils';
import { wsService } from './websocket';

export interface ClearingResult {
  success: boolean;
  transactions: Transaction[];
  nodePrices: Map<string, number>;
  overloadedLines: TransmissionLine[];
  redispatchedInstructions: DispatchInstruction[];
  warnings: string[];
}

class TradingEngineService {
  async runMarketClearing(tradingDate: string): Promise<ClearingResult> {
    const warnings: string[] = [];
    const allTransactions: Transaction[] = [];
    const nodePrices = new Map<string, number>();
    const redispatchedInstructions: DispatchInstruction[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const hourResult = await this.clearHourMarket(tradingDate, hour);
      allTransactions.push(...hourResult.transactions);
      
      hourResult.transactions.forEach(t => {
        if (!nodePrices.has(t.nodeId)) {
          nodePrices.set(t.nodeId, t.nodePrice);
        }
      });

      if (hourResult.overloadedLines.length > 0) {
        warnings.push(`时段${hour}: ${hourResult.overloadedLines.length}条线路过载，已启动再调度`);
        const redispatches = this.performRedispatch(tradingDate, hour, hourResult.overloadedLines, hourResult.transactions);
        redispatchedInstructions.push(...redispatches);
      }
    }

    const overloadedLines = transmissionLineModel.findOverloaded();

    wsService.broadcast({
      type: 'market_cleared',
      payload: {
        tradingDate,
        transactionCount: allTransactions.length,
        nodePrices: Object.fromEntries(nodePrices),
        overloadedCount: overloadedLines.length,
        warnings
      },
      targetRoles: ['trading_center', 'dispatch_center', 'power_producer']
    });

    return {
      success: true,
      transactions: allTransactions,
      nodePrices,
      overloadedLines,
      redispatchedInstructions,
      warnings
    };
  }

  private async clearHourMarket(tradingDate: string, tradingHour: number): Promise<{
    transactions: Transaction[];
    overloadedLines: TransmissionLine[];
  }> {
    const pendingBids = bidModel.findPendingByDate(tradingDate)
      .filter(b => b.tradingHour === tradingHour)
      .sort((a, b) => a.price - b.price);

    if (pendingBids.length === 0) {
      return { transactions: [], overloadedLines: [] };
    }

    const totalDemand = this.calculateHourDemand(tradingDate, tradingHour);
    const transactions: Transaction[] = [];
    let accumulatedCapacity = 0;
    let clearingPrice = 0;

    for (const bid of pendingBids) {
      if (accumulatedCapacity >= totalDemand) break;

      const generator = generatorModel.findById(bid.generatorId);
      if (!generator) continue;

      const availableCapacity = Math.min(bid.capacity, totalDemand - accumulatedCapacity);
      if (availableCapacity <= 0) break;

      clearingPrice = bid.price;
      
      const isCrossBorder = this.isCrossBorderTransaction(generator.region, tradingDate, tradingHour);
      const transaction = transactionModel.create({
        bidId: bid.id,
        generatorId: bid.generatorId,
        plantId: bid.plantId,
        ownerId: bid.ownerId,
        tradingDate,
        tradingHour,
        clearedCapacity: roundTo(availableCapacity, 2),
        clearedPrice: roundTo(clearingPrice, 2),
        nodeId: generator.nodeId,
        nodePrice: roundTo(this.calculateNodePrice(generator.nodeId, clearingPrice, tradingHour), 2),
        isCrossBorder,
        fromRegion: generator.region,
        toRegion: isCrossBorder ? this.getTargetRegion(generator.region) : generator.region,
        status: 'confirmed'
      });

      bidModel.updateStatus(bid.id, 'cleared');
      transactions.push(transaction);
      accumulatedCapacity += availableCapacity;
    }

    const overloadedLines = this.checkLineOverload(transactions);

    return { transactions, overloadedLines };
  }

  private calculateHourDemand(tradingDate: string, tradingHour: number): number {
    const baseDemand = 3000;
    const hourFactors = [0.6, 0.55, 0.5, 0.5, 0.55, 0.7, 0.9, 1.0, 1.05, 1.0, 0.95, 0.9, 0.85, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.1, 1.0, 0.9, 0.8, 0.7];
    return baseDemand * hourFactors[tradingHour] * (0.95 + Math.random() * 0.1);
  }

  private calculateNodePrice(nodeId: string, systemPrice: number, tradingHour: number): number {
    const nodeCongestionPremium: Record<string, number> = {
      'BJ01': 1.1, 'SH01': 1.15, 'WH01': 1.0, 'XA01': 0.9, 'SY01': 0.85,
      'TJ01': 1.05, 'NJ01': 1.1, 'CS01': 0.95, 'LZ01': 0.88, 'DL01': 0.87
    };
    const premium = nodeCongestionPremium[nodeId] || 1.0;
    return systemPrice * premium;
  }

  private isCrossBorderTransaction(region: string, tradingDate: string, tradingHour: number): boolean {
    return Math.random() > 0.7;
  }

  private getTargetRegion(sourceRegion: string): string {
    const regions = ['华北', '华东', '华中', '西北', '东北'];
    const others = regions.filter(r => r !== sourceRegion);
    return others[Math.floor(Math.random() * others.length)];
  }

  private checkLineOverload(transactions: Transaction[]): TransmissionLine[] {
    const lineFlows = new Map<string, number>();
    const lines = transmissionLineModel.findAll();

    lines.forEach(line => {
      lineFlows.set(line.id, line.currentFlow);
    });

    transactions.forEach(t => {
      lines.forEach(line => {
        if ((line.fromRegion === t.fromRegion && line.toRegion === t.toRegion) ||
            (line.fromRegion === t.toRegion && line.toRegion === t.fromRegion)) {
          const currentFlow = lineFlows.get(line.id) || 0;
          const newFlow = currentFlow + t.clearedCapacity * 0.3;
          lineFlows.set(line.id, newFlow);
          transmissionLineModel.updateFlow(line.id, newFlow);
        }
      });
    });

    return transmissionLineModel.findOverloaded();
  }

  private performRedispatch(
    tradingDate: string,
    tradingHour: number,
    overloadedLines: TransmissionLine[],
    transactions: Transaction[]
  ): DispatchInstruction[] {
    const instructions: DispatchInstruction[] = [];
    
    overloadedLines.forEach(line => {
      const overloadAmount = line.currentFlow - line.maxCapacity;
      const affectedTransactions = transactions.filter(t => 
        (t.fromRegion === line.fromRegion && t.toRegion === line.toRegion) ||
        (t.fromRegion === line.toRegion && t.toRegion === line.fromRegion)
      );

      let reductionNeeded = overloadAmount;
      affectedTransactions.sort((a, b) => b.clearedPrice - a.clearedPrice);

      for (const trans of affectedTransactions) {
        if (reductionNeeded <= 0) break;

        const reduction = Math.min(trans.clearedCapacity * 0.3, reductionNeeded);
        const newOutput = trans.clearedCapacity - reduction;

        const instruction = dispatchModel.create({
          transactionId: trans.id,
          generatorId: trans.generatorId,
          plantId: trans.plantId,
          targetOutput: roundTo(newOutput, 2),
          startTime: addHours(`${tradingDate}T${String(tradingHour).padStart(2, '0')}:00:00`, 0),
          endTime: addHours(`${tradingDate}T${String(tradingHour).padStart(2, '0')}:00:00`, 1),
          status: 'pending',
          issuedBy: 'system'
        });

        const storageGenerators = generatorModel.findByType('energy_storage')
          .filter(g => g.region === line.fromRegion || g.region === line.toRegion);

        if (storageGenerators.length > 0 && reductionNeeded > 0) {
          const storageGen = storageGenerators[0];
          const storageInstruction = dispatchModel.create({
            generatorId: storageGen.id,
            plantId: storageGen.id,
            targetOutput: roundTo(Math.min(reduction, storageGen.maxCapacity), 2),
            startTime: addHours(`${tradingDate}T${String(tradingHour).padStart(2, '0')}:00:00`, 0),
            endTime: addHours(`${tradingDate}T${String(tradingHour).padStart(2, '0')}:00:00`, 1),
            status: 'pending',
            issuedBy: 'system'
          });
          instructions.push(storageInstruction);
        }

        instructions.push(instruction);
        reductionNeeded -= reduction;
      }
    });

    wsService.sendAlert({
      type: 'line_overload',
      severity: 'warning',
      title: '线路过载再调度通知',
      message: `${overloadedLines.length}条线路过载，已生成${instructions.length}条再调度指令`,
      targetRoles: ['dispatch_center', 'trading_center']
    });

    return instructions;
  }

  getTransactions(filters?: { plantId?: string; startDate?: string; endDate?: string; isCrossBorder?: boolean }): Transaction[] {
    if (filters?.plantId) {
      return transactionModel.findByPlant(filters.plantId, filters.startDate, filters.endDate);
    }
    if (filters?.isCrossBorder) {
      return transactionModel.findCrossBorder();
    }
    return transactionModel.findAll();
  }

  getTransactionById(id: string): Transaction | undefined {
    return transactionModel.findById(id);
  }

  getTransmissionLines(): TransmissionLine[] {
    return transmissionLineModel.findAll();
  }
}

export const tradingEngineService = new TradingEngineService();
