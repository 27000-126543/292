import { carbonAccountModel, alertModel } from '../models/operations';
import { generatorModel } from '../models/generator';
import type { CarbonAccount, CarbonTrade } from '../types';
import { generateId, roundTo, now } from '../utils';
import { wsService } from './websocket';
import { config } from '../config';

export interface CreateAccountInput {
  plantId: string;
  ownerId: string;
  period: string;
  quota: number;
}

export interface AddEmissionInput {
  accountId: string;
  emissionAmount: number;
}

export interface CarbonTradeInput {
  accountId: string;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
}

class CarbonService {
  createAccount(input: CreateAccountInput): CarbonAccount {
    const account = carbonAccountModel.create({
      ...input,
      actualEmission: 0,
      remaining: input.quota,
      status: 'sufficient',
      recommendations: [],
      tradingRecords: []
    });

    return account;
  }

  addEmission(input: AddEmissionInput): CarbonAccount {
    const account = carbonAccountModel.findById(input.accountId);
    if (!account) {
      throw new Error('碳账户不存在');
    }

    const newEmission = account.actualEmission + input.emissionAmount;
    carbonAccountModel.updateEmission(input.accountId, newEmission);
    
    const updated = carbonAccountModel.findById(input.accountId)!;

    if (updated.status === 'deficit' || updated.status === 'warning') {
      this.checkQuotaStatus(updated);
    }

    return updated;
  }

  executeTrade(input: CarbonTradeInput): CarbonAccount {
    const account = carbonAccountModel.findById(input.accountId);
    if (!account) {
      throw new Error('碳账户不存在');
    }

    const trade: CarbonTrade = {
      id: generateId(),
      accountId: input.accountId,
      type: input.type,
      amount: input.amount,
      price: input.price,
      totalCost: roundTo(input.amount * input.price, 2),
      createdAt: now()
    };

    const updatedRecords = [...account.tradingRecords, trade];
    
    let newRemaining = account.remaining;
    if (input.type === 'buy') {
      newRemaining += input.amount;
    } else {
      if (input.amount > account.remaining) {
        throw new Error('可出售配额不足');
      }
      newRemaining -= input.amount;
    }

    const newStatus = newRemaining < 0 ? 'deficit' : 
      (newRemaining < account.quota * config.rules.carbonQuotaWarningRatio ? 'warning' : 'sufficient');

    const recommendations = this.generateRecommendations({ ...account, remaining: newRemaining, status: newStatus });

    carbonAccountModel.updateWithTrade(input.accountId, newRemaining, newStatus, recommendations, updatedRecords);

    const updated = carbonAccountModel.findById(input.accountId)!;

    wsService.broadcast({
      type: 'carbon_trade_executed',
      payload: {
        account: updated,
        trade
      },
      targetRoles: ['trading_center', 'power_producer']
    });

    return updated;
  }

  private checkQuotaStatus(account: CarbonAccount) {
    if (account.status === 'deficit') {
      wsService.sendAlert({
        type: 'carbon_deficit',
        severity: 'critical',
        title: '【履约提醒】碳排放配额不足',
        message: `电厂${account.plantId}${account.period}周期碳排放配额不足，缺口${Math.abs(account.remaining).toFixed(2)}吨。请立即购买配额或优化发电方案，避免履约风险`,
        relatedId: account.id,
        targetRoles: ['trading_center', 'power_producer', 'carbon_analyst'],
        targetUsers: account.ownerId ? [account.ownerId] : undefined
      });
    } else if (account.status === 'warning') {
      wsService.sendAlert({
        type: 'carbon_deficit',
        severity: 'warning',
        title: '碳排放配额预警',
        message: `电厂${account.plantId}${account.period}周期碳排放配额已使用${((account.actualEmission / account.quota) * 100).toFixed(1)}%，请注意控制排放`,
        relatedId: account.id,
        targetRoles: ['power_producer', 'carbon_analyst'],
        targetUsers: account.ownerId ? [account.ownerId] : undefined
      });
    }
  }

  private generateRecommendations(account: CarbonAccount): string[] {
    const recommendations: string[] = [];
    
    if (account.status === 'deficit') {
      recommendations.push('立即在碳交易市场购买配额');
      recommendations.push('降低高碳排放机组出力比例');
      recommendations.push('增加新能源发电占比');
      recommendations.push('考虑参与需求响应降低负荷');
    } else if (account.status === 'warning') {
      recommendations.push('建议提前规划碳配额交易');
      recommendations.push('优化机组组合降低碳排放');
    } else {
      recommendations.push('配额充足，可考虑出售多余配额获利');
    }

    return recommendations;
  }

  calculatePlantEmission(plantId: string, startDate: string, endDate: string): number {
    const generators = generatorModel.findByPlant(plantId);
    let totalEmission = 0;

    generators.forEach(gen => {
      const avgOutput = (gen.maxCapacity + gen.minOutput) / 2;
      const hours = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 3600000;
      totalEmission += avgOutput * hours * gen.carbonEmissionRate;
    });

    return roundTo(totalEmission, 2);
  }

  generateComplianceReport(accountId: string): {
    account: CarbonAccount;
    compliance: boolean;
    suggestions: string[];
  } {
    const account = carbonAccountModel.findById(accountId);
    if (!account) {
      throw new Error('碳账户不存在');
    }

    const compliance = account.remaining >= 0;
    const suggestions: string[] = [];

    if (!compliance) {
      suggestions.push('需在履约截止日前购买足额配额');
      suggestions.push('可申请CCER项目核证减排量');
      suggestions.push('考虑与其他企业开展配额置换');
      
      wsService.sendAlert({
        type: 'carbon_compliance_warning',
        severity: 'critical',
        title: '【履约紧急提醒】碳履约不达标',
        message: `电厂${account.plantId}${account.period}周期碳配额缺口${Math.abs(account.remaining).toFixed(2)}吨，不满足履约要求。请立即采取措施，避免产生高额罚款`,
        relatedId: account.id,
        targetRoles: ['trading_center', 'power_producer', 'carbon_analyst'],
        targetUsers: account.ownerId ? [account.ownerId] : undefined
      });
    } else {
      suggestions.push('配额满足履约要求');
      if (account.remaining > account.quota * 0.1) {
        suggestions.push('多余配额可在市场出售获取收益');
      }
    }

    return {
      account,
      compliance,
      suggestions
    };
  }

  getAccounts(filters?: { plantId?: string; period?: string }): CarbonAccount[] {
    if (filters?.period) {
      return carbonAccountModel.findByPeriod(filters.period);
    }
    if (filters?.plantId) {
      return carbonAccountModel.findByPlant(filters.plantId);
    }
    return carbonAccountModel.findAll();
  }

  getAccountById(id: string): CarbonAccount | undefined {
    return carbonAccountModel.findById(id);
  }

  getCarbonPrice(): number {
    const basePrice = 50 + Math.random() * 20;
    return roundTo(basePrice, 2);
  }
}

export const carbonService = new CarbonService();
