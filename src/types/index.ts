export interface Generator {
  id: string;
  name: string;
  type: 'thermal' | 'hydro' | 'wind' | 'solar' | 'nuclear' | 'energy_storage';
  maxCapacity: number;
  minOutput: number;
  region: string;
  nodeId: string;
  ownerId: string;
  status: 'running' | 'stopped' | 'maintenance';
  rampRate: number;
  carbonEmissionRate: number;
}

export interface PowerPlant {
  id: string;
  name: string;
  ownerId: string;
  region: string;
  generators?: string[];
  totalCapacity: number;
}

export interface Bid {
  id: string;
  generatorId: string;
  plantId: string;
  ownerId: string;
  tradingDate: string;
  tradingHour: number;
  capacity: number;
  price: number;
  status: 'pending' | 'accepted' | 'rejected' | 'split' | 'cleared';
  createdAt: string;
  updatedAt: string;
  splitFrom?: string;
  rejectionReason?: string;
}

export interface BidStrategy {
  recommendedPrice: number;
  recommendedCapacity: number;
  priceConfidence: number;
  historicalTrend: 'rising' | 'falling' | 'stable';
  demandForecast: number;
  competitorAnalysis: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface Transaction {
  id: string;
  bidId: string;
  generatorId: string;
  plantId: string;
  ownerId: string;
  tradingDate: string;
  tradingHour: number;
  clearedCapacity: number;
  clearedPrice: number;
  nodeId: string;
  nodePrice: number;
  isCrossBorder: boolean;
  fromRegion: string;
  toRegion: string;
  status: 'pending' | 'confirmed' | 'settled';
  createdAt: string;
}

export interface TransmissionLine {
  id: string;
  fromNode: string;
  toNode: string;
  fromRegion: string;
  toRegion: string;
  maxCapacity: number;
  currentFlow: number;
  lossRate: number;
  status: 'normal' | 'overloaded' | 'maintenance';
}

export interface DispatchInstruction {
  id: string;
  transactionId?: string;
  generatorId: string;
  plantId: string;
  targetOutput: number;
  startTime: string;
  endTime: string;
  status: 'pending' | 'sent' | 'executing' | 'completed' | 'failed' | 'violated';
  actualOutput?: number;
  deviation?: number;
  issuedBy: string;
  issuedAt: string;
  acknowledgedAt?: string;
  completedAt?: string;
  violationCount: number;
  penaltyPoints: number;
}

export interface CrossBorderCheck {
  id: string;
  transactionId: string;
  fromRegion: string;
  toRegion: string;
  status: 'pending' | 'checking' | 'approved' | 'rejected' | 'timeout' | 'escalated';
  checks: {
    region: string;
    status: 'pending' | 'approved' | 'rejected';
    checkedAt?: string;
    checker?: string;
    comment?: string;
  }[];
  createdAt: string;
  expiresAt: string;
  escalated?: boolean;
}

export interface Settlement {
  id: string;
  plantId: string;
  ownerId: string;
  period: string;
  periodType: 'daily' | 'monthly';
  totalEnergy: number;
  totalRevenue: number;
  deviationPenalty: number;
  carbonCost: number;
  renewableCompensation: number;
  dispatchPenaltyDeduction: number;
  netAmount: number;
  penaltyRules: string;
  status: 'calculated' | 'confirmed' | 'paid';
  createdAt: string;
  items: SettlementItem[];
}

export interface SettlementItem {
  transactionId: string;
  tradingDate: string;
  tradingHour: number;
  scheduledEnergy: number;
  actualEnergy: number;
  deviation: number;
  deviationRatio: number;
  price: number;
  amount: number;
  penalty: number;
  penaltyRule: string;
}

export interface RenewableForecast {
  id: string;
  generatorId: string;
  forecastDate: string;
  forecastHour: number;
  forecastOutput: number;
  actualOutput?: number;
  deviation?: number;
  deviationRatio?: number;
  status: 'forecast' | 'completed' | 'exceeded';
  storageDispatched?: number;
  loadDispatched?: number;
  compensation?: number;
}

export interface CarbonAccount {
  id: string;
  plantId: string;
  ownerId: string;
  period: string;
  quota: number;
  actualEmission: number;
  remaining: number;
  status: 'sufficient' | 'warning' | 'deficit';
  recommendations: string[];
  tradingRecords: CarbonTrade[];
}

export interface CarbonTrade {
  id: string;
  accountId: string;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  totalCost: number;
  createdAt: string;
}

export interface Alert {
  id: string;
  type: 'dispatch_violation' | 'line_overload' | 'renewable_deviation' | 'carbon_deficit' | 'carbon_compliance_warning' | 'check_timeout' | 'system';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  relatedId?: string;
  targetRoles: UserRole[];
  targetUsers?: string[];
  acknowledged: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  type: string;
  payload: any;
  targetRoles: string[];
  targetUsers?: string[];
  createdAt: string;
}

export type UserRole = 'trading_center' | 'dispatch_center' | 'power_producer' | 'admin' | 'carbon_analyst';
