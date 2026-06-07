import { bidModel } from '../models/trading';
import { generatorModel as genModel } from '../models/generator';
import type { Bid, BidStrategy, Generator } from '../types';
import { roundTo, randomBetween } from '../utils';
import { wsService } from './websocket';

export interface SubmitBidInput {
  generatorId: string;
  plantId: string;
  ownerId: string;
  tradingDate: string;
  tradingHour: number;
  capacity: number;
  price: number;
}

export interface BidResult {
  success: boolean;
  bids: Bid[];
  warnings?: string[];
  rejectionReason?: string;
}

class BiddingService {
  async recommendStrategy(generatorId: string, tradingDate: string, tradingHour: number): Promise<BidStrategy> {
    const generator = genModel.findById(generatorId);
    if (!generator) {
      throw new Error('Generator not found');
    }

    const historicalPrices = bidModel.getHistoricalPrices(generatorId, 30);
    
    let avgPrice = 350;
    let historicalTrend: BidStrategy['historicalTrend'] = 'stable';
    
    if (historicalPrices.length >= 5) {
      avgPrice = historicalPrices.reduce((sum, p) => sum + p.price, 0) / historicalPrices.length;
      
      const recentPrices = historicalPrices.slice(0, 5).map(p => p.price);
      const olderPrices = historicalPrices.slice(5, 10).map(p => p.price);
      const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
      const olderAvg = olderPrices.length > 0 ? olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length : recentAvg;
      
      if (recentAvg > olderAvg * 1.05) historicalTrend = 'rising';
      else if (recentAvg < olderAvg * 0.95) historicalTrend = 'falling';
    }

    const demandForecast = this.forecastDemand(tradingDate, tradingHour, generator.region);
    const competitorAnalysis = this.analyzeCompetitors(generator.region, tradingDate, tradingHour);
    
    let recommendedPrice = avgPrice;
    let priceConfidence = 0.7;
    let riskLevel: BidStrategy['riskLevel'] = 'medium';

    if (demandForecast > 1.1) {
      recommendedPrice *= 1.15;
      priceConfidence = 0.85;
      riskLevel = 'low';
    } else if (demandForecast < 0.9) {
      recommendedPrice *= 0.9;
      riskLevel = 'high';
    }

    if (historicalTrend === 'rising') {
      recommendedPrice *= 1.05;
      priceConfidence -= 0.1;
    } else if (historicalTrend === 'falling') {
      recommendedPrice *= 0.95;
      priceConfidence -= 0.1;
    }

    return {
      recommendedPrice: roundTo(recommendedPrice, 2),
      recommendedCapacity: roundTo(generator.maxCapacity * 0.8, 2),
      priceConfidence: roundTo(priceConfidence, 2),
      historicalTrend,
      demandForecast,
      competitorAnalysis,
      riskLevel
    };
  }

  private forecastDemand(tradingDate: string, tradingHour: number, region: string): number {
    const hourFactor = [0.6, 0.55, 0.5, 0.5, 0.55, 0.7, 0.9, 1.0, 1.05, 1.0, 0.95, 0.9, 0.85, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.1, 1.0, 0.9, 0.8, 0.7][tradingHour];
    const regionFactor = { '华北': 1.05, '华东': 1.1, '华中': 0.95, '西北': 0.85, '东北': 0.8 }[region] || 1;
    return roundTo(hourFactor * regionFactor * (0.95 + Math.random() * 0.1), 2);
  }

  private analyzeCompetitors(region: string, tradingDate: string, tradingHour: number): string {
    const generators = genModel.findByRegion(region);
    const thermalCount = generators.filter(g => g.type === 'thermal').length;
    const renewableCount = generators.filter(g => ['wind', 'solar', 'hydro'].includes(g.type)).length;
    
    if (renewableCount > thermalCount) {
      return '区域内新能源占比较高，白天时段竞争激烈，建议夜间报价';
    } else if (thermalCount > renewableCount * 2) {
      return '区域内火电为主，价格相对稳定，可按常规策略报价';
    }
    return '区域内电源结构均衡，建议参考历史均价报价';
  }

  validateAndSubmitBid(input: SubmitBidInput): BidResult {
    const generator = genModel.findById(input.generatorId);
    if (!generator) {
      return { success: false, bids: [], rejectionReason: '机组不存在' };
    }

    if (generator.status !== 'running') {
      return { success: false, bids: [], rejectionReason: `机组当前状态为${generator.status}，无法申报` };
    }

    if (input.capacity <= 0) {
      return { success: false, bids: [], rejectionReason: '申报容量必须大于0' };
    }

    if (input.price <= 0 || input.price > 2000) {
      return { success: false, bids: [], rejectionReason: '申报价格需在0-2000元/MWh之间' };
    }

    if (input.tradingHour < 0 || input.tradingHour > 23) {
      return { success: false, bids: [], rejectionReason: '交易时段需在0-23之间' };
    }

    const warnings: string[] = [];
    const resultBids: Bid[] = [];

    if (input.capacity > generator.maxCapacity) {
      const splitCount = Math.ceil(input.capacity / generator.maxCapacity);
      warnings.push(`申报容量${input.capacity}MW超出机组上限${generator.maxCapacity}MW，已自动拆分为${splitCount}个报价`);

      let remainingCapacity = input.capacity;
      for (let i = 0; i < splitCount; i++) {
        const splitCapacity = Math.min(remainingCapacity, generator.maxCapacity);
        const bid = bidModel.create({
          generatorId: input.generatorId,
          plantId: input.plantId,
          ownerId: input.ownerId,
          tradingDate: input.tradingDate,
          tradingHour: input.tradingHour,
          capacity: roundTo(splitCapacity, 2),
          price: input.price,
          status: 'split',
          splitFrom: i === 0 ? undefined : resultBids[0].id
        });
        resultBids.push(bid);
        remainingCapacity -= splitCapacity;
      }
    } else if (input.capacity < generator.minOutput && input.capacity > 0) {
      warnings.push(`申报容量${input.capacity}MW低于机组最小出力${generator.minOutput}MW`);
      const bid = bidModel.create({
        ...input,
        status: 'accepted'
      });
      resultBids.push(bid);
    } else {
      const bid = bidModel.create({
        ...input,
        status: 'accepted'
      });
      resultBids.push(bid);
    }

    wsService.broadcast({
      type: 'bid_submitted',
      payload: { bids: resultBids, warnings },
      targetRoles: ['trading_center', 'power_producer']
    });

    return {
      success: true,
      bids: resultBids,
      warnings
    };
  }

  getBidsByOwner(ownerId: string): Bid[] {
    return bidModel.findByOwner(ownerId);
  }

  getBidById(id: string): Bid | undefined {
    return bidModel.findById(id);
  }

  getPendingBids(tradingDate: string): Bid[] {
    return bidModel.findPendingByDate(tradingDate);
  }

  getGenerators(): Generator[] {
    return genModel.findAll();
  }
}

export const biddingService = new BiddingService();
