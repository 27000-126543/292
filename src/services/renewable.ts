import { renewableForecastModel } from '../models/operations';
import { generatorModel } from '../models/generator';
import type { RenewableForecast, Generator } from '../types';
import { roundTo, now } from '../utils';
import { wsService } from './websocket';
import { config } from '../config';

export interface CreateForecastInput {
  generatorId: string;
  forecastDate: string;
  forecastHour: number;
  forecastOutput: number;
}

export interface UpdateActualInput {
  forecastId: string;
  actualOutput: number;
}

class RenewableService {
  createForecast(input: CreateForecastInput): RenewableForecast {
    const generator = generatorModel.findById(input.generatorId);
    if (!generator) {
      throw new Error('机组不存在');
    }

    if (!['wind', 'solar'].includes(generator.type)) {
      throw new Error('仅支持风电和光伏的新能源预测');
    }

    const forecast = renewableForecastModel.create({
      ...input,
      status: 'forecast'
    });

    return forecast;
  }

  updateActualOutput(input: UpdateActualInput): RenewableForecast {
    const forecast = renewableForecastModel.findById(input.forecastId);
    if (!forecast) {
      throw new Error('预测记录不存在');
    }

    const updated = renewableForecastModel.updateActual(input.forecastId, input.actualOutput);

    if (updated.deviationRatio !== undefined && updated.deviationRatio > config.rules.renewableDeviationThreshold) {
      this.handleDeviation(updated);
    }

    return updated;
  }

  private handleDeviation(forecast: RenewableForecast) {
    const generator = generatorModel.findById(forecast.generatorId);
    if (!generator) return;

    const deviation = Math.abs(forecast.deviation || 0);
    const storageAmount = Math.min(deviation * 0.6, 200);
    const loadAmount = Math.min(deviation * 0.3, 100);
    const totalDispatched = storageAmount + loadAmount;
    const compensation = roundTo(totalDispatched * config.rules.renewableCompensationPrice, 2);

    renewableForecastModel.dispatchStorage(forecast.id, storageAmount, loadAmount, compensation);

    const storageGenerators = generatorModel.findByType('energy_storage')
      .filter(g => g.region === generator.region);

    wsService.sendAlert({
      type: 'renewable_deviation',
      severity: 'warning',
      title: '新能源预测偏差超限',
      message: `${generator.name}预测偏差${(forecast.deviationRatio! * 100).toFixed(1)}%，偏差电量${deviation.toFixed(2)}MWh，已调用储能${storageAmount}MW、可调负荷${loadAmount}MW，补偿单价${config.rules.renewableCompensationPrice}元/MWh，补偿费用${compensation}元`,
      relatedId: forecast.id,
      targetRoles: ['dispatch_center', 'power_producer']
    });

    wsService.broadcast({
      type: 'storage_dispatched',
      payload: {
        forecastId: forecast.id,
        generatorId: forecast.generatorId,
        deviationAmount: deviation,
        storageAmount,
        loadAmount,
        compensationPrice: config.rules.renewableCompensationPrice,
        compensation,
        availableStorage: storageGenerators.map(g => ({ id: g.id, name: g.name, maxCapacity: g.maxCapacity }))
      },
      targetRoles: ['dispatch_center', 'power_producer']
    });
  }

  generateDayAheadForecast(generatorId: string, forecastDate: string): RenewableForecast[] {
    const generator = generatorModel.findById(generatorId);
    if (!generator) {
      throw new Error('机组不存在');
    }

    const forecasts: RenewableForecast[] = [];

    for (let hour = 0; hour < 24; hour++) {
      let forecastOutput = 0;
      
      if (generator.type === 'solar') {
        if (hour >= 6 && hour <= 18) {
          const hourFactor = Math.sin(((hour - 6) / 12) * Math.PI);
          forecastOutput = generator.maxCapacity * hourFactor * (0.7 + Math.random() * 0.3);
        }
      } else if (generator.type === 'wind') {
        const baseFactor = 0.4 + Math.random() * 0.5;
        const hourVariation = hour >= 20 || hour <= 6 ? 1.2 : 0.9;
        forecastOutput = generator.maxCapacity * baseFactor * hourVariation;
      }

      const forecast = this.createForecast({
        generatorId,
        forecastDate,
        forecastHour: hour,
        forecastOutput: roundTo(forecastOutput, 2)
      });

      forecasts.push(forecast);
    }

    return forecasts;
  }

  calculateCompensation(forecastId: string): number {
    const forecast = renewableForecastModel.findById(forecastId);
    if (!forecast) return 0;
    return forecast.compensation || 0;
  }

  getForecasts(filters?: { generatorId?: string; startDate?: string; exceeded?: boolean }): RenewableForecast[] {
    if (filters?.exceeded) {
      return renewableForecastModel.findExceeded();
    }
    if (filters?.generatorId) {
      return renewableForecastModel.findByGenerator(filters.generatorId, filters.startDate);
    }
    return renewableForecastModel.findAll();
  }

  getForecastById(id: string): RenewableForecast | undefined {
    return renewableForecastModel.findById(id);
  }

  getAvailableStorage(region: string): Generator[] {
    return generatorModel.findByType('energy_storage').filter(g => g.region === region);
  }
}

export const renewableService = new RenewableService();
