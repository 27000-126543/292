import { db } from '../database/init';
import type { Generator, PowerPlant } from '../types';
import { generateId } from '../utils';

export const generatorModel = {
  findAll(): Generator[] {
    return db.findAll('generators');
  },

  findById(id: string): Generator | undefined {
    return db.findById('generators', id);
  },

  findByPlant(plantId: string): Generator[] {
    return db.findWhere('generators', g => g.id.startsWith(plantId.substring(0, 4)));
  },

  findByRegion(region: string): Generator[] {
    return db.findWhere('generators', g => g.region === region);
  },

  findByType(type: string): Generator[] {
    return db.findWhere('generators', g => g.type === type);
  },

  create(data: Omit<Generator, 'id'>): Generator {
    const id = generateId();
    const record = { ...data, id } as Generator;
    db.insert('generators', record);
    return record;
  },

  updateStatus(id: string, status: Generator['status']): void {
    db.update('generators', id, { status });
  }
};

export const powerPlantModel = {
  findAll(): PowerPlant[] {
    return db.findAll('powerPlants');
  },

  findById(id: string): PowerPlant | undefined {
    return db.findById('powerPlants', id);
  },

  findByOwner(ownerId: string): PowerPlant[] {
    return db.findWhere('powerPlants', p => p.ownerId === ownerId);
  },

  findByRegion(region: string): PowerPlant[] {
    return db.findWhere('powerPlants', p => p.region === region);
  },

  create(data: Omit<PowerPlant, 'id'>): PowerPlant {
    const id = generateId();
    const record = { ...data, id } as PowerPlant;
    db.insert('powerPlants', record);
    return record;
  }
};
