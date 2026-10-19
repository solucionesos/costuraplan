export type MachineType =
  | 'Plana'
  | 'Fileteadora'
  | 'Collarín'
  | 'Presilladora'
  | 'Ojaladora'
  | 'Botonadora'
  | 'Manual'
  | 'Especial';

export type DeliveryMode = 'asap' | 'by-deadline';

export interface SewingOperation {
  id: string;
  name: string;
  machine: MachineType;
  standardMinutes: number; // SAM en minutos (ej. 0.5 = 30 seg)
  description: string;
}

export interface DaySchedule {
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  name: string;
  enabled: boolean;
  startTime: string; // HH:MM (ej. "07:00")
  endTime: string;   // HH:MM (ej. "17:00")
  breakMinutes: number; // Minutos de almuerzo/pausa
}

export interface WorkshopConfig {
  days: DaySchedule[];
  nonWorkingDates: string[]; // YYYY-MM-DD
}

export interface ColorBatch {
  id: string;
  colorName: string;
  colorHex: string;
  units: number;
}

export interface ProductionOperationItem {
  operationId: string;
  operationName: string;
  machine: MachineType;
  minutesPerUnit: number;
}

export interface ExecutionLog {
  id: string;
  reportDate: string; // YYYY-MM-DD (día real en que se ejecutó / reportó)
  scheduledSourceDate?: string; // YYYY-MM-DD (día original del bloque si fue adelantado)
  colorId: string;
  operationId: string;
  unitsExecuted: number;
  plannedUnitsAtReport?: number;
  shiftRemainingToNextDay: boolean; // Si hizo menos de las programadas, traslada el saldo al día siguiente
  createdAt: string;
}

export interface ProductionOrder {
  id: string;
  garmentName: string;
  referenceCode: string;
  receivedDate: string; // YYYY-MM-DD
  deliveryDate: string; // YYYY-MM-DD
  /**
   * 'asap': Apenas esté lista (usa el 100% del tiempo disponible de cada día para terminar lo antes posible)
   * 'by-deadline': Fecha de Entrega (reparte las operaciones en todos los días hábiles del plazo aunque se trabaje menos horas por día)
   */
  deliveryMode?: DeliveryMode;
  colors: ColorBatch[];
  operations: ProductionOperationItem[];
  completedTaskKeys: string[];
  executionLogs?: ExecutionLog[];
  createdAt: string;
}

export interface ScheduledTaskBlock {
  taskKey: string;
  date: string;
  productionId: string;
  garmentName: string;
  referenceCode: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  operationId: string;
  operationName: string;
  machine: MachineType;
  unitsAssigned: number;
  unitsExecuted?: number;
  shortfallUnitsMovedNextDay?: number;
  totalColorUnits: number;
  minutesAssigned: number;
  startClock: string;
  endClock: string;
  isOperationCompletedInThisBlock: boolean;
  isColorCompletedInThisBlock: boolean;
  isAfterDeadline: boolean;
  isExecutedReport?: boolean;
  isAdvanceFromFuture?: boolean;
  scheduledSourceDate?: string;
  executionLogId?: string;
}

export interface EvacuatedColorBadge {
  productionId: string;
  garmentName: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  totalUnits: number;
}

export interface DayPlan {
  date: string;
  dayOfWeek: number;
  dayName: string;
  isWorkingDay: boolean;
  capacityMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  blocks: ScheduledTaskBlock[];
  colorsEvacuated: EvacuatedColorBadge[];
}

export interface ProductionScheduleSummary {
  productionId: string;
  deliveryMode: DeliveryMode;
  totalUnits: number;
  minutesPerUnit: number;
  totalRequiredMinutes: number;
  executedMinutes: number;
  pendingMinutes: number;
  availableMinutesBeforeDeadline: number;
  workingDaysBeforeDeadline: number;
  isFeasibleOnSchedule: boolean;
  deficitMinutes: number;
  requiredDailyMinutesToMeetDeadline: number;
  estimatedCompletionDate: string | null;
  colorCompletionDates: Record<string, string>;
}

export interface FullScheduleResult {
  days: DayPlan[];
  summaries: Record<string, ProductionScheduleSummary>;
}
