import { initDatabase, db } from './init';
import { generateId } from '../utils';
import type { DatabaseTables } from './init';

function seed() {
  initDatabase();
  console.log('Seeding database...');

  const regions = ['华北', '华东', '华中', '西北', '东北'];

  const plants: DatabaseTables['powerPlants'] = [
    { id: generateId(), name: '华北大唐发电厂', ownerId: 'owner_001', region: '华北', totalCapacity: 2000 },
    { id: generateId(), name: '华东华能电厂', ownerId: 'owner_002', region: '华东', totalCapacity: 1800 },
    { id: generateId(), name: '华中国电发电厂', ownerId: 'owner_003', region: '华中', totalCapacity: 1500 },
    { id: generateId(), name: '西北风电基地', ownerId: 'owner_004', region: '西北', totalCapacity: 1200 },
    { id: generateId(), name: '东北光伏电站', ownerId: 'owner_005', region: '东北', totalCapacity: 800 },
    { id: generateId(), name: '华北储能电站', ownerId: 'owner_001', region: '华北', totalCapacity: 500 },
    { id: generateId(), name: '华东抽水蓄能', ownerId: 'owner_002', region: '华东', totalCapacity: 600 },
  ];

  const generators: DatabaseTables['generators'] = [
    { id: generateId(), name: '1号火电机组', type: 'thermal', maxCapacity: 600, minOutput: 240, region: '华北', nodeId: 'BJ01', ownerId: 'owner_001', status: 'running', rampRate: 50, carbonEmissionRate: 0.85 },
    { id: generateId(), name: '2号火电机组', type: 'thermal', maxCapacity: 600, minOutput: 240, region: '华北', nodeId: 'BJ01', ownerId: 'owner_001', status: 'running', rampRate: 50, carbonEmissionRate: 0.85 },
    { id: generateId(), name: '3号水电机组', type: 'hydro', maxCapacity: 800, minOutput: 100, region: '华北', nodeId: 'TJ01', ownerId: 'owner_001', status: 'running', rampRate: 200, carbonEmissionRate: 0.02 },
    { id: generateId(), name: '1号燃气机组', type: 'thermal', maxCapacity: 400, minOutput: 150, region: '华东', nodeId: 'SH01', ownerId: 'owner_002', status: 'running', rampRate: 80, carbonEmissionRate: 0.55 },
    { id: generateId(), name: '2号燃气机组', type: 'thermal', maxCapacity: 400, minOutput: 150, region: '华东', nodeId: 'SH01', ownerId: 'owner_002', status: 'running', rampRate: 80, carbonEmissionRate: 0.55 },
    { id: generateId(), name: '3号核电机组', type: 'nuclear', maxCapacity: 1000, minOutput: 900, region: '华东', nodeId: 'NJ01', ownerId: 'owner_002', status: 'running', rampRate: 10, carbonEmissionRate: 0.01 },
    { id: generateId(), name: '1号火电机组', type: 'thermal', maxCapacity: 500, minOutput: 200, region: '华中', nodeId: 'WH01', ownerId: 'owner_003', status: 'running', rampRate: 60, carbonEmissionRate: 0.82 },
    { id: generateId(), name: '2号水电机组', type: 'hydro', maxCapacity: 1000, minOutput: 150, region: '华中', nodeId: 'CS01', ownerId: 'owner_003', status: 'running', rampRate: 250, carbonEmissionRate: 0.02 },
    { id: generateId(), name: '1号风电场', type: 'wind', maxCapacity: 600, minOutput: 0, region: '西北', nodeId: 'XA01', ownerId: 'owner_004', status: 'running', rampRate: 500, carbonEmissionRate: 0.01 },
    { id: generateId(), name: '2号风电场', type: 'wind', maxCapacity: 600, minOutput: 0, region: '西北', nodeId: 'LZ01', ownerId: 'owner_004', status: 'running', rampRate: 500, carbonEmissionRate: 0.01 },
    { id: generateId(), name: '1号光伏电站', type: 'solar', maxCapacity: 400, minOutput: 0, region: '东北', nodeId: 'SY01', ownerId: 'owner_005', status: 'running', rampRate: 400, carbonEmissionRate: 0.01 },
    { id: generateId(), name: '2号光伏电站', type: 'solar', maxCapacity: 400, minOutput: 0, region: '东北', nodeId: 'DL01', ownerId: 'owner_005', status: 'running', rampRate: 400, carbonEmissionRate: 0.01 },
    { id: generateId(), name: '1号储能电站', type: 'energy_storage', maxCapacity: 500, minOutput: -500, region: '华北', nodeId: 'BJ01', ownerId: 'owner_001', status: 'running', rampRate: 500, carbonEmissionRate: 0 },
    { id: generateId(), name: '2号储能电站', type: 'energy_storage', maxCapacity: 600, minOutput: -600, region: '华东', nodeId: 'SH01', ownerId: 'owner_002', status: 'running', rampRate: 600, carbonEmissionRate: 0 },
  ];

  const transmissionLines: DatabaseTables['transmissionLines'] = [
    { id: generateId(), fromNode: 'BJ01', toNode: 'TJ01', fromRegion: '华北', toRegion: '华北', maxCapacity: 1000, currentFlow: 450, lossRate: 0.02, status: 'normal' },
    { id: generateId(), fromNode: 'BJ01', toNode: 'SH01', fromRegion: '华北', toRegion: '华东', maxCapacity: 800, currentFlow: 500, lossRate: 0.03, status: 'normal' },
    { id: generateId(), fromNode: 'SH01', toNode: 'NJ01', fromRegion: '华东', toRegion: '华东', maxCapacity: 1200, currentFlow: 600, lossRate: 0.02, status: 'normal' },
    { id: generateId(), fromNode: 'BJ01', toNode: 'WH01', fromRegion: '华北', toRegion: '华中', maxCapacity: 900, currentFlow: 400, lossRate: 0.03, status: 'normal' },
    { id: generateId(), fromNode: 'WH01', toNode: 'CS01', fromRegion: '华中', toRegion: '华中', maxCapacity: 1500, currentFlow: 700, lossRate: 0.02, status: 'normal' },
    { id: generateId(), fromNode: 'WH01', toNode: 'XA01', fromRegion: '华中', toRegion: '西北', maxCapacity: 700, currentFlow: 300, lossRate: 0.04, status: 'normal' },
    { id: generateId(), fromNode: 'XA01', toNode: 'LZ01', fromRegion: '西北', toRegion: '西北', maxCapacity: 1000, currentFlow: 400, lossRate: 0.02, status: 'normal' },
    { id: generateId(), fromNode: 'BJ01', toNode: 'SY01', fromRegion: '华北', toRegion: '东北', maxCapacity: 600, currentFlow: 250, lossRate: 0.03, status: 'normal' },
    { id: generateId(), fromNode: 'SY01', toNode: 'DL01', fromRegion: '东北', toRegion: '东北', maxCapacity: 800, currentFlow: 350, lossRate: 0.02, status: 'normal' },
  ];

  const today = new Date().toISOString().split('T')[0];
  const bids: DatabaseTables['bids'] = [];
  for (let i = 0; i < 5; i++) {
    const gen = generators[i];
    for (let hour = 0; hour < 24; hour += 4) {
      const price = 250 + Math.random() * 200;
      const capacity = gen.maxCapacity * (0.6 + Math.random() * 0.3);
      bids.push({
        id: generateId(),
        generatorId: gen.id,
        plantId: plants[i % plants.length].id,
        ownerId: gen.ownerId,
        tradingDate: today,
        tradingHour: hour,
        capacity: Math.round(capacity * 100) / 100,
        price: Math.round(price * 100) / 100,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  const carbonAccounts: DatabaseTables['carbonAccounts'] = [];
  for (let i = 0; i < 4; i++) {
    const plant = plants[i];
    const quota = plant.totalCapacity * 0.5;
    const actualEmission = quota * (0.8 + Math.random() * 0.4);
    const remaining = quota - actualEmission;
    carbonAccounts.push({
      id: generateId(),
      plantId: plant.id,
      ownerId: plant.ownerId,
      period: '2026-06',
      quota,
      actualEmission: Math.round(actualEmission * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
      status: remaining < 0 ? 'deficit' : (remaining < quota * 0.1 ? 'warning' : 'sufficient'),
      recommendations: [],
      tradingRecords: []
    });
  }

  db.seed({
    generators,
    powerPlants: plants,
    transmissionLines,
    bids,
    carbonAccounts,
    transactions: [],
    dispatchInstructions: [],
    crossBorderChecks: [],
    settlements: [],
    renewableForecasts: [],
    alerts: []
  });

  console.log(`Seeded ${plants.length} power plants`);
  console.log(`Seeded ${generators.length} generators`);
  console.log(`Seeded ${transmissionLines.length} transmission lines`);
  console.log(`Seeded ${bids.length} bids`);
  console.log(`Seeded ${carbonAccounts.length} carbon accounts`);
  console.log('Database seeding complete!');
}

seed();
