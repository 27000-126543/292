import { db } from '../database/init';
import type { Bid, TransmissionLine, Transaction } from '../types';
import { generateId, now } from '../utils';

export const bidModel = {
  findAll(): Bid[] {
    return db.findAll('bids').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  findById(id: string): Bid | undefined {
    return db.findById('bids', id);
  },

  findByGenerator(generatorId: string, tradingDate?: string): Bid[] {
    let bids = db.findWhere('bids', b => b.generatorId === generatorId);
    if (tradingDate) {
      bids = bids.filter(b => b.tradingDate === tradingDate);
      bids.sort((a, b) => a.tradingHour - b.tradingHour);
    } else {
      bids.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return bids;
  },

  findByOwner(ownerId: string): Bid[] {
    return db.findWhere('bids', b => b.ownerId === ownerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  findPendingByDate(tradingDate: string): Bid[] {
    return db.findWhere('bids', b => b.tradingDate === tradingDate && b.status === 'pending')
      .sort((a, b) => a.price - b.price);
  },

  create(data: Omit<Bid, 'id' | 'createdAt' | 'updatedAt'>): Bid {
    const id = generateId();
    const timestamp = now();
    const record = {
      ...data,
      id,
      createdAt: timestamp,
      updatedAt: timestamp
    } as Bid;
    db.insert('bids', record);
    return record;
  },

  updateStatus(id: string, status: Bid['status'], rejectionReason?: string): void {
    db.update('bids', id, {
      status,
      rejectionReason: rejectionReason || undefined,
      updatedAt: now()
    });
  },

  getHistoricalPrices(generatorId: string, limit: number = 30): { price: number; tradingDate: string; tradingHour: number }[] {
    return db.findWhere('bids', b => 
      b.generatorId === generatorId && ['accepted', 'cleared'].includes(b.status)
    )
      .sort((a, b) => {
        const dateA = new Date(a.tradingDate).getTime() + a.tradingHour * 3600000;
        const dateB = new Date(b.tradingDate).getTime() + b.tradingHour * 3600000;
        return dateB - dateA;
      })
      .slice(0, limit)
      .map(b => ({ price: b.price, tradingDate: b.tradingDate, tradingHour: b.tradingHour }));
  }
};

export const transmissionLineModel = {
  findAll(): TransmissionLine[] {
    return db.findAll('transmissionLines');
  },

  findById(id: string): TransmissionLine | undefined {
    return db.findById('transmissionLines', id);
  },

  findByRegions(fromRegion: string, toRegion: string): TransmissionLine[] {
    return db.findWhere('transmissionLines', l => 
      (l.fromRegion === fromRegion && l.toRegion === toRegion) ||
      (l.fromRegion === toRegion && l.toRegion === fromRegion)
    );
  },

  findOverloaded(): TransmissionLine[] {
    return db.findWhere('transmissionLines', l => l.status === 'overloaded');
  },

  updateFlow(id: string, currentFlow: number): void {
    const line = db.findById('transmissionLines', id);
    if (line) {
      const status = currentFlow > line.maxCapacity ? 'overloaded' : 'normal';
      db.update('transmissionLines', id, { currentFlow, status });
    }
  },

  create(data: Omit<TransmissionLine, 'id'>): TransmissionLine {
    const id = generateId();
    const record = { ...data, id } as TransmissionLine;
    db.insert('transmissionLines', record);
    return record;
  }
};

export const transactionModel = {
  findAll(): Transaction[] {
    return db.findAll('transactions')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  findById(id: string): Transaction | undefined {
    return db.findById('transactions', id);
  },

  findByPlant(plantId: string, startDate?: string, endDate?: string): Transaction[] {
    let transactions = db.findWhere('transactions', t => t.plantId === plantId);
    if (startDate) {
      transactions = transactions.filter(t => t.tradingDate >= startDate);
    }
    if (endDate) {
      transactions = transactions.filter(t => t.tradingDate <= endDate);
    }
    return transactions.sort((a, b) => {
      const dateA = new Date(a.tradingDate).getTime() + a.tradingHour * 3600000;
      const dateB = new Date(b.tradingDate).getTime() + b.tradingHour * 3600000;
      return dateB - dateA;
    });
  },

  findByDate(tradingDate: string): Transaction[] {
    return db.findWhere('transactions', t => t.tradingDate === tradingDate)
      .sort((a, b) => a.tradingHour - b.tradingHour);
  },

  findCrossBorder(): Transaction[] {
    return db.findWhere('transactions', t => t.isCrossBorder)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  create(data: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
    const id = generateId();
    const timestamp = now();
    const record = { ...data, id, createdAt: timestamp } as Transaction;
    db.insert('transactions', record);
    return record;
  },

  updateStatus(id: string, status: Transaction['status']): void {
    db.update('transactions', id, { status });
  }
};
