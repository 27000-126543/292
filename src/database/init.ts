import fs from 'fs';
import path from 'path';
import type {
  Generator, PowerPlant, Bid, Transaction, TransmissionLine,
  DispatchInstruction, CrossBorderCheck, Settlement,
  RenewableForecast, CarbonAccount, Alert, CarbonTrade
} from '../types';

export interface DatabaseTables {
  generators: Generator[];
  powerPlants: PowerPlant[];
  bids: Bid[];
  transactions: Transaction[];
  transmissionLines: TransmissionLine[];
  dispatchInstructions: DispatchInstruction[];
  crossBorderChecks: CrossBorderCheck[];
  settlements: Settlement[];
  renewableForecasts: RenewableForecast[];
  carbonAccounts: CarbonAccount[];
  alerts: Alert[];
}

const DB_FILE = path.join('./data', 'database.json');

const initialData: DatabaseTables = {
  generators: [],
  powerPlants: [],
  bids: [],
  transactions: [],
  transmissionLines: [],
  dispatchInstructions: [],
  crossBorderChecks: [],
  settlements: [],
  renewableForecasts: [],
  carbonAccounts: [],
  alerts: []
};

class InMemoryDatabase {
  private data: DatabaseTables;
  private persist: boolean;

  constructor(persist: boolean = true) {
    this.persist = persist;
    this.data = this.load();
  }

  private load(): DatabaseTables {
    if (!this.persist) {
      return JSON.parse(JSON.stringify(initialData));
    }

    try {
      if (fs.existsSync(DB_FILE)) {
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.warn('Failed to load database, using empty data:', e);
    }

    return JSON.parse(JSON.stringify(initialData));
  }

  save(): void {
    if (!this.persist) return;

    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Failed to save database:', e);
    }
  }

  get tables(): Readonly<DatabaseTables> {
    return this.data;
  }

  get generators(): Generator[] { return this.data.generators; }
  get powerPlants(): PowerPlant[] { return this.data.powerPlants; }
  get bids(): Bid[] { return this.data.bids; }
  get transactions(): Transaction[] { return this.data.transactions; }
  get transmissionLines(): TransmissionLine[] { return this.data.transmissionLines; }
  get dispatchInstructions(): DispatchInstruction[] { return this.data.dispatchInstructions; }
  get crossBorderChecks(): CrossBorderCheck[] { return this.data.crossBorderChecks; }
  get settlements(): Settlement[] { return this.data.settlements; }
  get renewableForecasts(): RenewableForecast[] { return this.data.renewableForecasts; }
  get carbonAccounts(): CarbonAccount[] { return this.data.carbonAccounts; }
  get alerts(): Alert[] { return this.data.alerts; }

  insert<T extends keyof DatabaseTables>(table: T, record: DatabaseTables[T][number]): void {
    (this.data[table] as any[]).push(record);
    this.save();
  }

  update<T extends keyof DatabaseTables>(
    table: T,
    id: string,
    updates: Partial<DatabaseTables[T][number]>
  ): boolean {
    const index = (this.data[table] as any[]).findIndex((r: any) => r.id === id);
    if (index === -1) return false;

    (this.data[table] as any[])[index] = {
      ...(this.data[table] as any[])[index],
      ...updates
    };
    this.save();
    return true;
  }

  findById<T extends keyof DatabaseTables>(table: T, id: string): DatabaseTables[T][number] | undefined {
    return (this.data[table] as any[]).find((r: any) => r.id === id);
  }

  findAll<T extends keyof DatabaseTables>(table: T): DatabaseTables[T][number][] {
    return [...this.data[table] as any[]];
  }

  findWhere<T extends keyof DatabaseTables>(
    table: T,
    predicate: (record: DatabaseTables[T][number]) => boolean
  ): DatabaseTables[T][number][] {
    return (this.data[table] as any[]).filter(predicate);
  }

  findOneWhere<T extends keyof DatabaseTables>(
    table: T,
    predicate: (record: DatabaseTables[T][number]) => boolean
  ): DatabaseTables[T][number] | undefined {
    return (this.data[table] as any[]).find(predicate);
  }

  delete<T extends keyof DatabaseTables>(table: T, id: string): boolean {
    const index = (this.data[table] as any[]).findIndex((r: any) => r.id === id);
    if (index === -1) return false;
    (this.data[table] as any[]).splice(index, 1);
    this.save();
    return true;
  }

  reset(): void {
    this.data = JSON.parse(JSON.stringify(initialData));
    this.save();
  }

  seed(data: Partial<DatabaseTables>): void {
    this.data = { ...this.data, ...data } as DatabaseTables;
    this.save();
  }
}

export const db = new InMemoryDatabase(process.env.NODE_ENV !== 'test');

export function initDatabase(): void {
  console.log('Database initialized (in-memory with JSON persistence)');
}
