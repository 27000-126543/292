import { db } from '../database/init';
import type {
  DispatchInstruction, CrossBorderCheck, Settlement,
  RenewableForecast, CarbonAccount, Alert, CarbonTrade
} from '../types';
import { generateId, now } from '../utils';

export const dispatchModel = {
  findAll(): DispatchInstruction[] {
    return db.findAll('dispatchInstructions')
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  },

  findById(id: string): DispatchInstruction | undefined {
    return db.findById('dispatchInstructions', id);
  },

  findByGenerator(generatorId: string): DispatchInstruction[] {
    return db.findWhere('dispatchInstructions', d => d.generatorId === generatorId)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  },

  findActive(): DispatchInstruction[] {
    return db.findWhere('dispatchInstructions', d => ['sent', 'acknowledged', 'executing'].includes(d.status))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  },

  findViolations(): DispatchInstruction[] {
    return db.findWhere('dispatchInstructions', d => d.violationCount > 0)
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  },

  create(data: Omit<DispatchInstruction, 'id' | 'issuedAt' | 'violationCount' | 'penaltyPoints'>): DispatchInstruction {
    const id = generateId();
    const timestamp = now();
    const record = {
      ...data,
      id,
      issuedAt: timestamp,
      violationCount: 0,
      penaltyPoints: 0
    } as DispatchInstruction;
    db.insert('dispatchInstructions', record);
    return record;
  },

  updateStatus(id: string, status: DispatchInstruction['status'], actualOutput?: number): void {
    const instruction = db.findById('dispatchInstructions', id);
    if (!instruction) return;

    const timestamp = now();
    let deviation: number | null = null;
    if (actualOutput !== undefined) {
      deviation = actualOutput - instruction.targetOutput;
    }

    let violationCount = instruction.violationCount;
    let penaltyPoints = instruction.penaltyPoints;

    if (status === 'violated') {
      violationCount++;
      penaltyPoints += 10;
    }

    db.update('dispatchInstructions', id, {
      status,
      actualOutput: actualOutput !== undefined ? actualOutput : instruction.actualOutput,
      deviation: deviation !== null ? deviation : instruction.deviation,
      acknowledgedAt: status === 'acknowledged' ? timestamp : instruction.acknowledgedAt,
      completedAt: ['completed', 'failed', 'violated'].includes(status) ? timestamp : instruction.completedAt,
      violationCount,
      penaltyPoints
    });
  },

  acknowledge(id: string): void {
    db.update('dispatchInstructions', id, {
      status: 'acknowledged',
      acknowledgedAt: now()
    });
  },

  addPenaltyPoints(id: string, extraPoints: number): void {
    const instruction = db.findById('dispatchInstructions', id);
    if (!instruction) return;
    db.update('dispatchInstructions', id, {
      penaltyPoints: instruction.penaltyPoints + extraPoints,
      continuousPenalty: (instruction.continuousPenalty || 0) + extraPoints,
      continuousPenaltyApplied: true
    });
  },

  getPenaltySummary(plantId: string, startDate: string, endDate: string): { 
    totalViolations: number; 
    totalPoints: number;
    basePoints: number;
    continuousPenalty: number;
  } {
    const instructions = db.findWhere('dispatchInstructions', d => {
      if (d.plantId !== plantId) return false;
      const issuedDate = d.issuedAt.substring(0, 10);
      return issuedDate >= startDate && issuedDate <= endDate;
    });

    const basePoints = instructions.reduce((sum, i) => sum + i.violationCount * 10, 0);
    const continuousPenalty = instructions.reduce((sum, i) => sum + (i.continuousPenalty || 0), 0);

    return {
      totalViolations: instructions.reduce((sum, i) => sum + i.violationCount, 0),
      totalPoints: basePoints + continuousPenalty,
      basePoints,
      continuousPenalty
    };
  }
};

export const crossBorderCheckModel = {
  findAll(): CrossBorderCheck[] {
    return db.findAll('crossBorderChecks')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  findById(id: string): CrossBorderCheck | undefined {
    return db.findById('crossBorderChecks', id);
  },

  findByTransaction(transactionId: string): CrossBorderCheck | undefined {
    return db.findOneWhere('crossBorderChecks', c => c.transactionId === transactionId);
  },

  findPending(): CrossBorderCheck[] {
    return db.findWhere('crossBorderChecks', c => ['pending', 'checking'].includes(c.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },

  create(data: Omit<CrossBorderCheck, 'id' | 'createdAt'>): CrossBorderCheck {
    const id = generateId();
    const timestamp = now();
    const record = {
      ...data,
      id,
      createdAt: timestamp,
      escalated: false
    } as CrossBorderCheck;
    db.insert('crossBorderChecks', record);
    return record;
  },

  updateCheck(id: string, region: string, status: 'approved' | 'rejected', checker: string, comment?: string): void {
    const check = db.findById('crossBorderChecks', id);
    if (!check) return;

    const checkIndex = check.checks.findIndex(c => c.region === region);
    if (checkIndex >= 0) {
      const newChecks = [...check.checks];
      newChecks[checkIndex] = {
        ...newChecks[checkIndex],
        status,
        checkedAt: now(),
        checker,
        comment
      };

      const allApproved = newChecks.every(c => c.status === 'approved');
      const anyRejected = newChecks.some(c => c.status === 'rejected');
      const newStatus = anyRejected ? 'rejected' : (allApproved ? 'approved' : 'checking');

      db.update('crossBorderChecks', id, {
        status: newStatus,
        checks: newChecks
      });
    }
  },

  escalate(id: string): void {
    db.update('crossBorderChecks', id, { status: 'escalated', escalated: true });
  },

  setTimeout(id: string): void {
    db.update('crossBorderChecks', id, { status: 'timeout' });
  }
};

export const settlementModel = {
  findAll(): Settlement[] {
    return db.findAll('settlements')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  findById(id: string): Settlement | undefined {
    return db.findById('settlements', id);
  },

  findByPlant(plantId: string): Settlement[] {
    return db.findWhere('settlements', s => s.plantId === plantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  findByPeriod(period: string, periodType: 'daily' | 'monthly'): Settlement[] {
    return db.findWhere('settlements', s => s.period === period && s.periodType === periodType)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  create(data: Omit<Settlement, 'id' | 'createdAt'>): Settlement {
    const id = generateId();
    const timestamp = now();
    const record = { ...data, id, createdAt: timestamp } as Settlement;
    db.insert('settlements', record);
    return record;
  },

  updateStatus(id: string, status: Settlement['status']): void {
    db.update('settlements', id, { status });
  }
};

export const renewableForecastModel = {
  findAll(): RenewableForecast[] {
    return db.findAll('renewableForecasts')
      .sort((a, b) => {
        const dateA = new Date(a.forecastDate).getTime() + a.forecastHour * 3600000;
        const dateB = new Date(b.forecastDate).getTime() + b.forecastHour * 3600000;
        return dateB - dateA;
      });
  },

  findById(id: string): RenewableForecast | undefined {
    return db.findById('renewableForecasts', id);
  },

  findByGenerator(generatorId: string, startDate?: string): RenewableForecast[] {
    let forecasts = db.findWhere('renewableForecasts', f => f.generatorId === generatorId);
    if (startDate) {
      forecasts = forecasts.filter(f => f.forecastDate >= startDate);
    }
    return forecasts.sort((a, b) => {
      const dateA = new Date(a.forecastDate).getTime() + a.forecastHour * 3600000;
      const dateB = new Date(b.forecastDate).getTime() + b.forecastHour * 3600000;
      return dateA - dateB;
    });
  },

  findExceeded(): RenewableForecast[] {
    return db.findWhere('renewableForecasts', f => f.status === 'exceeded')
      .sort((a, b) => new Date(b.forecastDate).getTime() - new Date(a.forecastDate).getTime());
  },

  create(data: Omit<RenewableForecast, 'id'>): RenewableForecast {
    const id = generateId();
    const record = {
      ...data,
      id,
      storageDispatched: 0,
      loadDispatched: 0,
      compensation: 0
    } as RenewableForecast;
    db.insert('renewableForecasts', record);
    return record;
  },

  updateActual(id: string, actualOutput: number): RenewableForecast {
    const forecast = db.findById('renewableForecasts', id);
    if (!forecast) throw new Error('Forecast not found');

    const deviation = Math.abs(actualOutput - forecast.forecastOutput);
    const deviationRatio = forecast.forecastOutput > 0 ? deviation / forecast.forecastOutput : 0;
    const status = deviationRatio > 0.15 ? 'exceeded' : 'completed';

    db.update('renewableForecasts', id, {
      actualOutput,
      deviation,
      deviationRatio,
      status
    });

    return { ...forecast, actualOutput, deviation, deviationRatio, status };
  },

  dispatchStorage(id: string, storageAmount: number, loadAmount: number, compensation: number): void {
    const forecast = db.findById('renewableForecasts', id);
    if (!forecast) return;

    db.update('renewableForecasts', id, {
      storageDispatched: (forecast.storageDispatched || 0) + storageAmount,
      loadDispatched: (forecast.loadDispatched || 0) + loadAmount,
      compensation: (forecast.compensation || 0) + compensation
    });
  }
};

export const carbonAccountModel = {
  findAll(): CarbonAccount[] {
    return db.findAll('carbonAccounts')
      .sort((a, b) => b.period.localeCompare(a.period));
  },

  findById(id: string): CarbonAccount | undefined {
    return db.findById('carbonAccounts', id);
  },

  findByPlant(plantId: string): CarbonAccount[] {
    return db.findWhere('carbonAccounts', c => c.plantId === plantId)
      .sort((a, b) => b.period.localeCompare(a.period));
  },

  findByPeriod(period: string): CarbonAccount[] {
    return db.findWhere('carbonAccounts', c => c.period === period);
  },

  create(data: Omit<CarbonAccount, 'id'>): CarbonAccount {
    const id = generateId();
    const record = { ...data, id } as CarbonAccount;
    db.insert('carbonAccounts', record);
    return record;
  },

  updateEmission(id: string, actualEmission: number): void {
    const account = db.findById('carbonAccounts', id);
    if (!account) return;

    const remaining = account.quota - actualEmission;
    const status = remaining < 0 ? 'deficit' : (remaining < account.quota * 0.1 ? 'warning' : 'sufficient');

    const recommendations: string[] = [];
    if (status === 'deficit') {
      recommendations.push('建议立即购买碳配额', '考虑优化机组运行降低碳排放', '增加新能源发电比例');
    } else if (status === 'warning') {
      recommendations.push('请注意碳排放配额余额', '建议提前规划碳交易');
    }

    db.update('carbonAccounts', id, {
      actualEmission,
      remaining,
      status,
      recommendations
    });
  },

  updateWithTrade(id: string, remaining: number, status: CarbonAccount['status'], recommendations: string[], tradingRecords: CarbonTrade[]): void {
    db.update('carbonAccounts', id, {
      remaining,
      status,
      recommendations,
      tradingRecords
    });
  }
};

export const alertModel = {
  findAll(limit: number = 100): Alert[] {
    return db.findAll('alerts')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  findById(id: string): Alert | undefined {
    return db.findById('alerts', id);
  },

  findByRole(role: string): Alert[] {
    return db.findWhere('alerts', a => a.targetRoles.includes(role as any))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);
  },

  findByRoleAndOwner(role: string, ownerId: string): Alert[] {
    return db.findWhere('alerts', a => {
      if (!a.targetRoles.includes(role as any)) return false;
      if (a.targetUsers && a.targetUsers.length > 0) {
        return a.targetUsers.includes(ownerId);
      }
      return true;
    })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);
  },

  create(data: Omit<Alert, 'id' | 'createdAt' | 'acknowledged'>): Alert {
    const id = generateId();
    const timestamp = now();
    const record = {
      ...data,
      id,
      createdAt: timestamp,
      acknowledged: false
    } as Alert;
    db.insert('alerts', record);
    return record;
  },

  acknowledge(id: string): void {
    db.update('alerts', id, { acknowledged: true });
  }
};
