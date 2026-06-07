import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

export const generateId = (): string => uuidv4();

export const now = (): string => dayjs().toISOString();

export const formatDate = (date: string | Date): string => 
  dayjs(date).format('YYYY-MM-DD');

export const formatDateTime = (date: string | Date): string =>
  dayjs(date).format('YYYY-MM-DD HH:mm:ss');

export const addMinutes = (date: string | Date, minutes: number): string =>
  dayjs(date).add(minutes, 'minute').toISOString();

export const addHours = (date: string | Date, hours: number): string =>
  dayjs(date).add(hours, 'hour').toISOString();

export const isExpired = (date: string | Date): boolean =>
  dayjs(date).isBefore(dayjs());

export const randomBetween = (min: number, max: number): number =>
  Math.random() * (max - min) + min;

export const roundTo = (value: number, decimals: number = 2): number =>
  Number(value.toFixed(decimals));

export const calculateDeviation = (actual: number, forecast: number): number => {
  if (forecast === 0) return actual === 0 ? 0 : 1;
  return Math.abs(actual - forecast) / forecast;
};
