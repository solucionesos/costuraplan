import {
  createSampleProductionOrder,
  DEFAULT_OPERATIONS,
  DEFAULT_WORKSHOP_CONFIG,
} from './domain/defaults';
import { addDaysIso } from './domain/scheduler';
import { ProductionOrder, SewingOperation, WorkshopConfig } from './domain/types';

const KEYS = {
  OPERATIONS: 'costuraplan_operations_v1',
  WORKSHOP: 'costuraplan_workshop_v1',
  PRODUCTIONS: 'costuraplan_productions_v1',
};

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function loadOperations(): SewingOperation[] {
  try {
    const raw = localStorage.getItem(KEYS.OPERATIONS);
    if (!raw) return DEFAULT_OPERATIONS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_OPERATIONS;
  } catch {
    return DEFAULT_OPERATIONS;
  }
}

export function saveOperations(ops: SewingOperation[]): void {
  localStorage.setItem(KEYS.OPERATIONS, JSON.stringify(ops));
}

export function loadWorkshopConfig(): WorkshopConfig {
  try {
    const raw = localStorage.getItem(KEYS.WORKSHOP);
    if (!raw) return DEFAULT_WORKSHOP_CONFIG;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.days) ? parsed : DEFAULT_WORKSHOP_CONFIG;
  } catch {
    return DEFAULT_WORKSHOP_CONFIG;
  }
}

export function saveWorkshopConfig(config: WorkshopConfig): void {
  localStorage.setItem(KEYS.WORKSHOP, JSON.stringify(config));
}

export function loadProductions(): ProductionOrder[] {
  try {
    const raw = localStorage.getItem(KEYS.PRODUCTIONS);
    if (!raw) {
      const today = getTodayIso();
      const sample = [createSampleProductionOrder(today, addDaysIso(today, 5))];
      localStorage.setItem(KEYS.PRODUCTIONS, JSON.stringify(sample));
      return sample;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProductions(orders: ProductionOrder[]): void {
  localStorage.setItem(KEYS.PRODUCTIONS, JSON.stringify(orders));
}
