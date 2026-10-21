import {
  ColorBatch,
  DayPlan,
  DaySchedule,
  DeliveryMode,
  ExecutionLog,
  FullScheduleResult,
  ProductionOrder,
  ProductionScheduleSummary,
  ScheduledTaskBlock,
  SizeBatch,
  SizeSortOrder,
  WorkshopConfig,
} from './types';

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const LETTER_SIZE_RANKS: Record<string, number> = {
  UNICA: 0,
  ÚNICA: 0,
  U: 0,
  XXS: 201,
  '2XS': 201,
  XS: 202,
  S: 203,
  M: 204,
  L: 205,
  XL: 206,
  XXL: 207,
  '2XL': 207,
  XXXL: 208,
  '3XL': 208,
  '4XL': 209,
  '5XL': 210,
};

export function getSizeRank(size: string): number {
  const normalized = size.trim().toUpperCase();
  if (normalized in LETTER_SIZE_RANKS) {
    return LETTER_SIZE_RANKS[normalized];
  }
  const numericVal = Number(normalized);
  if (!Number.isNaN(numericVal) && normalized !== '') {
    return 100 + numericVal;
  }
  return 500;
}

export function sortSizes(
  sizes: SizeBatch[],
  sortOrder: SizeSortOrder = 'asc'
): SizeBatch[] {
  const direction = sortOrder === 'desc' ? -1 : 1;
  return [...sizes]
    .filter((s) => s.units > 0 && s.size.trim().length > 0)
    .map((s) => ({ ...s, units: Math.ceil(s.units) }))
    .sort((a, b) => {
      const rankA = getSizeRank(a.size);
      const rankB = getSizeRank(b.size);
      if (rankA !== rankB) {
        return (rankA - rankB) * direction;
      }
      return a.size.localeCompare(b.size, 'es', { numeric: true }) * direction;
    });
}

export function getOrderedColorSizes(
  color: ColorBatch,
  sortOrder: SizeSortOrder = 'asc'
): SizeBatch[] {
  if (color.sizes && color.sizes.length > 0) {
    const valid = sortSizes(color.sizes, sortOrder);
    if (valid.length > 0) {
      return valid;
    }
  }
  return color.units > 0 ? [{ size: 'Única', units: Math.ceil(color.units) }] : [];
}

export function getColorTotalUnits(color: ColorBatch): number {
  if (color.sizes && color.sizes.length > 0) {
    const sum = color.sizes.reduce(
      (acc, s) => acc + Math.max(0, Math.ceil(s.units)),
      0
    );
    if (sum > 0) return sum;
  }
  return Math.max(0, Math.ceil(color.units));
}

export function parseTimeToMinutes(clock: string): number {
  const parts = clock.trim().split(':');
  if (parts.length !== 2) return 0;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return 0;
  }
  return hours * 60 + minutes;
}

export function formatMinutesToClock(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function calculateDayAvailableMinutes(day: DaySchedule): number {
  if (!day.enabled) return 0;
  const start = parseTimeToMinutes(day.startTime);
  const end = parseTimeToMinutes(day.endTime);
  if (end <= start) return 0;
  const net = end - start - Math.max(0, day.breakMinutes);
  return Math.max(0, net);
}

export function calculateWeeklyMinutes(config: WorkshopConfig): number {
  return config.days.reduce((acc, day) => acc + calculateDayAvailableMinutes(day), 0);
}

export function formatDurationHuman(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 1) {
    return `${Math.round(minutes * 60)} seg`;
  }
  const rounded = Math.round(minutes * 10) / 10;
  const wholeHours = Math.floor(rounded / 60);
  const remMinutes = Math.round(rounded - wholeHours * 60);
  if (wholeHours === 0) {
    return `${rounded} min`;
  }
  if (remMinutes === 0) {
    return `${wholeHours}h`;
  }
  return `${wholeHours}h ${remMinutes}m`;
}

export function parseIsoDateUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatIsoDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso: string, daysToAdd: number): string {
  const dt = parseIsoDateUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + daysToAdd);
  return formatIsoDateUTC(dt);
}

export function getDayOfWeekIso(iso: string): number {
  return parseIsoDateUTC(iso).getUTCDay();
}

export function listDatesBetweenIso(startIso: string, endIso: string): string[] {
  if (endIso < startIso) return [];
  const result: string[] = [];
  let curr = startIso;
  let guard = 0;
  while (curr <= endIso && guard < 730) {
    result.push(curr);
    curr = addDaysIso(curr, 1);
    guard += 1;
  }
  return result;
}

export function getDayScheduleForDate(iso: string, config: WorkshopConfig): DaySchedule {
  const dow = getDayOfWeekIso(iso);
  const found = config.days.find((d) => d.dayOfWeek === dow);
  if (found) return found;
  return {
    dayOfWeek: dow,
    name: DAY_NAMES_ES[dow] ?? 'Día',
    enabled: false,
    startTime: '08:00',
    endTime: '17:00',
    breakMinutes: 60,
  };
}

export function getAvailableMinutesForDate(iso: string, config: WorkshopConfig): number {
  if (config.nonWorkingDates.includes(iso)) {
    return 0;
  }
  const daySched = getDayScheduleForDate(iso, config);
  return calculateDayAvailableMinutes(daySched);
}

export function reorderProductionOperations(
  order: ProductionOrder,
  fromIndex: number,
  toIndex: number
): ProductionOrder {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= order.operations.length ||
    toIndex >= order.operations.length ||
    fromIndex === toIndex
  ) {
    return order;
  }
  const nextOps = [...order.operations];
  const [moved] = nextOps.splice(fromIndex, 1);
  nextOps.splice(toIndex, 0, moved);
  return {
    ...order,
    operations: nextOps,
  };
}

export function getExecutedUnitsForOperation(
  order: ProductionOrder,
  colorId: string,
  operationId: string,
  size?: string
): number {
  const logs = order.executionLogs ?? [];
  const color = order.colors.find((c) => c.id === colorId);
  const orderedSizes = color
    ? getOrderedColorSizes(color, order.sizeSortOrder ?? 'asc')
    : [];
  const isSingleSize = orderedSizes.length <= 1;

  return logs
    .filter((l) => {
      if (l.colorId !== colorId || l.operationId !== operationId) return false;
      if (!size) return true;
      if (l.size === size) return true;
      if (!l.size && (size === 'Única' || isSingleSize)) return true;
      return false;
    })
    .reduce((sum, l) => sum + Math.max(0, l.unitsExecuted), 0);
}

export type ReportNoveltyType = 'shortfall' | 'advance' | 'overproduction' | 'exact';

export interface ExecutionReportValidation {
  valid: boolean;
  error?: string;
  noveltyType: ReportNoveltyType;
  shortfallUnits: number;
  maxAllowedUnits: number;
  summaryMessage: string;
}

export function validateExecutionReport(
  order: ProductionOrder,
  params: {
    reportDate: string;
    scheduledSourceDate: string;
    colorId: string;
    size?: string;
    operationId: string;
    unitsExecuted: number;
    plannedUnitsOnBlock: number;
  }
): ExecutionReportValidation {
  const color = order.colors.find((c) => c.id === params.colorId);
  const op = order.operations.find((o) => o.operationId === params.operationId);

  if (!color || !op) {
    return {
      valid: false,
      error: 'El color o la operación seleccionada no existe en la orden.',
      noveltyType: 'exact',
      shortfallUnits: 0,
      maxAllowedUnits: 0,
      summaryMessage: '',
    };
  }

  if (!params.reportDate || params.reportDate < order.receivedDate) {
    return {
      valid: false,
      error: `La fecha del reporte (${params.reportDate}) no puede ser anterior a la fecha de recepción (${order.receivedDate}).`,
      noveltyType: 'exact',
      shortfallUnits: 0,
      maxAllowedUnits: 0,
      summaryMessage: '',
    };
  }

  const orderedSizes = getOrderedColorSizes(color, order.sizeSortOrder ?? 'asc');
  const matchingSize = params.size
    ? orderedSizes.find((s) => s.size === params.size)
    : undefined;
  const targetTotalUnits = matchingSize
    ? matchingSize.units
    : getColorTotalUnits(color);

  const alreadyExecuted = getExecutedUnitsForOperation(
    order,
    params.colorId,
    params.operationId,
    matchingSize ? matchingSize.size : undefined
  );
  const maxAllowedUnits = Math.max(
    0,
    Math.ceil(targetTotalUnits - alreadyExecuted)
  );

  const sizeLabel = matchingSize ? ` - Talla ${matchingSize.size}` : '';

  if (isNaN(params.unitsExecuted) || params.unitsExecuted < 0) {
    return {
      valid: false,
      error: 'La cantidad de unidades ejecutadas debe ser un número mayor o igual a 0.',
      noveltyType: 'exact',
      shortfallUnits: 0,
      maxAllowedUnits,
      summaryMessage: '',
    };
  }

  const normalizedUnitsExecuted = Math.ceil(params.unitsExecuted);
  const normalizedPlannedUnits = Math.ceil(params.plannedUnitsOnBlock);

  if (normalizedUnitsExecuted > maxAllowedUnits) {
    return {
      valid: false,
      error: `No puedes reportar ${normalizedUnitsExecuted} uds porque solo quedan ${maxAllowedUnits} uds pendientes para ${op.operationName} (${color.colorName}${sizeLabel}).`,
      noveltyType: 'exact',
      shortfallUnits: 0,
      maxAllowedUnits,
      summaryMessage: '',
    };
  }

  const isAdvance = params.reportDate < params.scheduledSourceDate;
  if (isAdvance && normalizedUnitsExecuted <= 0) {
    return {
      valid: false,
      error: 'Para adelantar una operación de un día futuro debes ingresar al menos 1 unidad ejecutada.',
      noveltyType: 'advance',
      shortfallUnits: 0,
      maxAllowedUnits,
      summaryMessage: '',
    };
  }

  if (isAdvance) {
    return {
      valid: true,
      noveltyType: 'advance',
      shortfallUnits: 0,
      maxAllowedUnits,
      summaryMessage: `Estás reportando el día ${params.reportDate} un adelanto de ${normalizedUnitsExecuted} uds de "${op.operationName}" (Color ${color.colorName}${sizeLabel}) que estaba programada para el día ${params.scheduledSourceDate}. Se descontarán estas unidades del día futuro y se recalculará todo el calendario.`,
    };
  }

  const shortfall = Math.max(
    0,
    normalizedPlannedUnits - normalizedUnitsExecuted
  );

  if (shortfall > 0) {
    return {
      valid: true,
      noveltyType: 'shortfall',
      shortfallUnits: shortfall,
      maxAllowedUnits,
      summaryMessage: `Se ejecutaron ${normalizedUnitsExecuted} uds de las ${normalizedPlannedUnits} uds programadas para el día ${params.reportDate}. Las ${shortfall} unidades faltantes de "${op.operationName}" (Color ${color.colorName}${sizeLabel}) se trasladarán automáticamente al siguiente día hábil y se reprogramará el calendario.`,
    };
  }

  if (normalizedUnitsExecuted > normalizedPlannedUnits) {
    const extra = normalizedUnitsExecuted - normalizedPlannedUnits;
    return {
      valid: true,
      noveltyType: 'overproduction',
      shortfallUnits: 0,
      maxAllowedUnits,
      summaryMessage: `Se ejecutaron ${normalizedUnitsExecuted} uds (${extra} uds más de las ${normalizedPlannedUnits} uds programadas el ${params.reportDate}). Se adelantará el saldo restante en el calendario.`,
    };
  }

  return {
    valid: true,
    noveltyType: 'exact',
    shortfallUnits: 0,
    maxAllowedUnits,
    summaryMessage: `Se completaron las ${normalizedUnitsExecuted} uds programadas de "${op.operationName}" (Color ${color.colorName}${sizeLabel}) en el día ${params.reportDate}.`,
  };
}

export function applyExecutionReportToOrder(
  order: ProductionOrder,
  params: {
    reportDate: string;
    scheduledSourceDate: string;
    colorId: string;
    size?: string;
    operationId: string;
    unitsExecuted: number;
    plannedUnitsOnBlock: number;
  }
): ProductionOrder {
  const normalizedUnitsExecuted = Math.ceil(params.unitsExecuted);
  const normalizedPlannedUnits = Math.ceil(params.plannedUnitsOnBlock);
  const isShortfall =
    params.reportDate >= params.scheduledSourceDate &&
    normalizedUnitsExecuted < normalizedPlannedUnits;

  const newLog: ExecutionLog = {
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    reportDate: params.reportDate,
    scheduledSourceDate: params.scheduledSourceDate,
    colorId: params.colorId,
    size: params.size,
    operationId: params.operationId,
    unitsExecuted: normalizedUnitsExecuted,
    plannedUnitsAtReport: normalizedPlannedUnits,
    shiftRemainingToNextDay: isShortfall,
    createdAt: new Date().toISOString(),
  };

  return {
    ...order,
    executionLogs: [...(order.executionLogs ?? []), newLog],
  };
}

export function removeExecutionLog(
  order: ProductionOrder,
  logId: string
): ProductionOrder {
  return {
    ...order,
    executionLogs: (order.executionLogs ?? []).filter((l) => l.id !== logId),
  };
}

export function evaluateProductionSummary(
  order: ProductionOrder,
  config: WorkshopConfig
): ProductionScheduleSummary {
  const deliveryMode: DeliveryMode = order.deliveryMode ?? 'asap';
  const sizeSortOrder: SizeSortOrder = order.sizeSortOrder ?? 'asc';
  const totalUnits = order.colors.reduce(
    (sum, c) => sum + getColorTotalUnits(c),
    0
  );
  const minutesPerUnit = order.operations.reduce(
    (sum, op) => sum + Math.max(0, op.minutesPerUnit),
    0
  );
  const totalRequiredMinutes = Math.round(totalUnits * minutesPerUnit * 100) / 100;

  let executedMinutes = 0;
  for (const color of order.colors) {
    const colorUnits = getColorTotalUnits(color);
    for (const op of order.operations) {
      const doneUnits = Math.min(
        colorUnits,
        getExecutedUnitsForOperation(order, color.id, op.operationId)
      );
      executedMinutes += doneUnits * op.minutesPerUnit;
    }
  }
  executedMinutes = Math.round(executedMinutes * 100) / 100;
  const pendingMinutes = Math.max(
    0,
    Math.round((totalRequiredMinutes - executedMinutes) * 100) / 100
  );

  const dates = listDatesBetweenIso(order.receivedDate, order.deliveryDate);
  let availableMinutesBeforeDeadline = 0;
  let workingDaysBeforeDeadline = 0;

  for (const dt of dates) {
    const cap = getAvailableMinutesForDate(dt, config);
    if (cap > 0) {
      availableMinutesBeforeDeadline += cap;
      workingDaysBeforeDeadline += 1;
    }
  }

  const isFeasibleOnSchedule = availableMinutesBeforeDeadline >= totalRequiredMinutes;
  const deficitMinutes = Math.max(
    0,
    Math.round((totalRequiredMinutes - availableMinutesBeforeDeadline) * 100) / 100
  );
  const effectiveDays = Math.max(1, workingDaysBeforeDeadline);
  const requiredDailyMinutesToMeetDeadline =
    Math.ceil((totalRequiredMinutes / effectiveDays) * 10) / 10;

  return {
    productionId: order.id,
    deliveryMode,
    sizeSortOrder,
    totalUnits,
    minutesPerUnit: Math.round(minutesPerUnit * 100) / 100,
    totalRequiredMinutes,
    executedMinutes,
    pendingMinutes,
    availableMinutesBeforeDeadline,
    workingDaysBeforeDeadline,
    isFeasibleOnSchedule,
    deficitMinutes,
    requiredDailyMinutesToMeetDeadline,
    estimatedCompletionDate: null,
    colorCompletionDates: {},
  };
}

export interface ScheduleOptions {
  /**
   * 'order-default' / 'standard': Respeta la configuración de entrega de cada orden ('asap' o 'by-deadline').
   * 'fit-deadline': Fuerza la distribución en todos los días del plazo de entrega.
   */
  mode?: 'standard' | 'fit-deadline';
}

export function buildProductionSchedule(
  orders: ProductionOrder[],
  config: WorkshopConfig,
  options: ScheduleOptions = {}
): FullScheduleResult {
  const mode = options.mode ?? 'standard';
  const sortedOrders = [...orders].sort((a, b) => {
    if (a.deliveryDate !== b.deliveryDate) {
      return a.deliveryDate.localeCompare(b.deliveryDate);
    }
    return a.receivedDate.localeCompare(b.receivedDate);
  });

  const summaries: Record<string, ProductionScheduleSummary> = {};
  for (const order of sortedOrders) {
    summaries[order.id] = evaluateProductionSummary(order, config);
  }

  if (sortedOrders.length === 0) {
    return { days: [], summaries };
  }

  let minDate = sortedOrders[0].receivedDate;
  let maxDate = sortedOrders[0].deliveryDate;
  for (const o of sortedOrders) {
    if (o.receivedDate < minDate) minDate = o.receivedDate;
    if (o.deliveryDate > maxDate) maxDate = o.deliveryDate;
    for (const log of o.executionLogs ?? []) {
      if (log.reportDate < minDate) minDate = log.reportDate;
      if (log.reportDate > maxDate) maxDate = log.reportDate;
    }
  }

  const dayPlanMap = new Map<string, DayPlan>();

  const ensureDayPlan = (iso: string, extraDailyMinutes = 0): DayPlan => {
    const existing = dayPlanMap.get(iso);
    if (existing) {
      if (extraDailyMinutes > 0 && existing.isWorkingDay) {
        existing.capacityMinutes = Math.round((existing.capacityMinutes + extraDailyMinutes) * 100) / 100;
        existing.remainingMinutes = Math.max(
          0,
          Math.round((existing.capacityMinutes - existing.usedMinutes) * 100) / 100
        );
      }
      return existing;
    }
    const dow = getDayOfWeekIso(iso);
    const baseCap = getAvailableMinutesForDate(iso, config);
    const isWorking = baseCap > 0;
    const capacity = isWorking ? baseCap + extraDailyMinutes : 0;
    const plan: DayPlan = {
      date: iso,
      dayOfWeek: dow,
      dayName: DAY_NAMES_ES[dow] ?? 'Día',
      isWorkingDay: isWorking,
      capacityMinutes: capacity,
      usedMinutes: 0,
      remainingMinutes: capacity,
      blocks: [],
      colorsEvacuated: [],
    };
    dayPlanMap.set(iso, plan);
    return plan;
  };

  for (const dt of listDatesBetweenIso(minDate, maxDate)) {
    ensureDayPlan(dt, 0);
  }

  const computeClocks = (iso: string, startUsed: number, durationMinutes: number) => {
    const sched = getDayScheduleForDate(iso, config);
    const dayStartMin = parseTimeToMinutes(sched.startTime || '07:00');
    const rawStart = dayStartMin + startUsed;
    const rawEnd = rawStart + durationMinutes;
    return {
      startClock: formatMinutesToClock(rawStart),
      endClock: formatMinutesToClock(rawEnd),
    };
  };

  // STEP 1: Place all actual reported ExecutionLogs on their reportDate first
  for (const order of sortedOrders) {
    const sizeSortOrder: SizeSortOrder = order.sizeSortOrder ?? 'asc';
    const logs = [...(order.executionLogs ?? [])].sort((a, b) =>
      a.reportDate.localeCompare(b.reportDate)
    );

    const runningUnitsByKey = new Map<string, number>();

    for (const log of logs) {
      const color = order.colors.find((c) => c.id === log.colorId);
      const op = order.operations.find((o) => o.operationId === log.operationId);
      if (!color || !op) continue;

      const orderedSizes = getOrderedColorSizes(color, sizeSortOrder);
      const colorTotalUnits = getColorTotalUnits(color);
      const resolvedSize =
        log.size ?? orderedSizes[0]?.size ?? 'Única';
      const matchingSizeObj = orderedSizes.find((s) => s.size === resolvedSize);
      const sizeMaxUnits = matchingSizeObj ? matchingSizeObj.units : colorTotalUnits;

      const key = `${color.id}__${resolvedSize}__${op.operationId}`;
      const prevDone = runningUnitsByKey.get(key) ?? 0;
      const effectiveUnits = Math.max(
        0,
        Math.min(sizeMaxUnits - prevDone, Math.ceil(log.unitsExecuted))
      );
      const newDone = prevDone + effectiveUnits;
      runningUnitsByKey.set(key, newDone);

      const dayPlan = ensureDayPlan(log.reportDate);
      if (effectiveUnits > 0 && !dayPlan.isWorkingDay) {
        dayPlan.isWorkingDay = true;
      }

      const allocatedMinutes = Math.round(effectiveUnits * op.minutesPerUnit * 100) / 100;
      const startUsed = dayPlan.usedMinutes;
      const clocks = computeClocks(log.reportDate, startUsed, allocatedMinutes);

      dayPlan.usedMinutes = Math.round((dayPlan.usedMinutes + allocatedMinutes) * 100) / 100;
      dayPlan.remainingMinutes = Math.max(
        0,
        Math.round((dayPlan.capacityMinutes - dayPlan.usedMinutes) * 100) / 100
      );

      const isOpDone = newDone >= sizeMaxUnits - 0.001;
      const isAdvance = Boolean(
        log.scheduledSourceDate && log.scheduledSourceDate > log.reportDate
      );
      const shortfallMoved =
        log.shiftRemainingToNextDay &&
        log.plannedUnitsAtReport !== undefined &&
        log.unitsExecuted < log.plannedUnitsAtReport
          ? Math.ceil(log.plannedUnitsAtReport - log.unitsExecuted)
          : 0;

      const allColorOpsDone =
        isOpDone &&
        order.operations.every((candidateOp) => {
          const totalForCandidate = getExecutedUnitsForOperation(
            order,
            color.id,
            candidateOp.operationId
          );
          return totalForCandidate >= colorTotalUnits - 0.001;
        });

      if (effectiveUnits > 0 || shortfallMoved > 0) {
        const block: ScheduledTaskBlock = {
          taskKey: `exec__${log.id}`,
          date: log.reportDate,
          productionId: order.id,
          garmentName: order.garmentName,
          referenceCode: order.referenceCode,
          colorId: color.id,
          colorName: color.colorName,
          colorHex: color.colorHex,
          size: resolvedSize,
          totalSizeUnits: sizeMaxUnits,
          operationId: op.operationId,
          operationName: op.operationName,
          machine: op.machine,
          unitsAssigned: effectiveUnits,
          unitsExecuted: effectiveUnits,
          shortfallUnitsMovedNextDay: shortfallMoved,
          totalColorUnits: colorTotalUnits,
          minutesAssigned: allocatedMinutes,
          startClock: clocks.startClock,
          endClock: clocks.endClock,
          isOperationCompletedInThisBlock: isOpDone,
          isSizeCompletedInThisBlock: isOpDone,
          isColorCompletedInThisBlock: allColorOpsDone,
          isAfterDeadline: log.reportDate > order.deliveryDate,
          isExecutedReport: true,
          isAdvanceFromFuture: isAdvance,
          scheduledSourceDate: log.scheduledSourceDate,
          executionLogId: log.id,
        };
        dayPlan.blocks.push(block);
      }

      if (allColorOpsDone && !summaries[order.id].colorCompletionDates[color.id]) {
        dayPlan.colorsEvacuated.push({
          productionId: order.id,
          garmentName: order.garmentName,
          colorId: color.id,
          colorName: color.colorName,
          colorHex: color.colorHex,
          totalUnits: colorTotalUnits,
        });
        summaries[order.id].colorCompletionDates[color.id] = log.reportDate;
        summaries[order.id].estimatedCompletionDate = log.reportDate;
      }
    }
  }

  // STEP 2: Schedule remaining pending units per Color -> Size (ordered by sizeSortOrder) -> Operation
  for (const order of sortedOrders) {
    const sizeSortOrder: SizeSortOrder = order.sizeSortOrder ?? 'asc';
    const validOps = order.operations.filter((op) => op.minutesPerUnit > 0);
    const validColors = order.colors.filter((c) => getColorTotalUnits(c) > 0);
    if (validOps.length === 0 || validColors.length === 0) {
      continue;
    }

    const summary = summaries[order.id];
    const logs = order.executionLogs ?? [];
    const useByDeadlineMode =
      mode === 'fit-deadline' || order.deliveryMode === 'by-deadline';

    // Determine earliest date for pending work of this order
    let earliestOrderDate = order.receivedDate;
    for (const l of logs) {
      if (l.shiftRemainingToNextDay) {
        const shifted = addDaysIso(l.reportDate, 1);
        if (shifted > earliestOrderDate) {
          earliestOrderDate = shifted;
        }
      }
    }

    // Calculate daily quota if 'by-deadline' (Fecha de Entrega: repartir en todos los días del plazo)
    let dailyDeadlineQuota: number | null = null;
    let lastWorkingDateInWindow: string | null = null;
    const orderPendingUsedByDate = new Map<string, number>();

    if (useByDeadlineMode && summary.pendingMinutes > 0) {
      const windowEnd =
        earliestOrderDate > order.deliveryDate ? earliestOrderDate : order.deliveryDate;
      const windowDates = listDatesBetweenIso(earliestOrderDate, windowEnd);
      const workingWindowDates = windowDates.filter(
        (d) => getAvailableMinutesForDate(d, config) > 0
      );

      if (workingWindowDates.length === 0 && windowDates.length > 0) {
        const fallbackDay = ensureDayPlan(earliestOrderDate, 0);
        fallbackDay.isWorkingDay = true;
        fallbackDay.capacityMinutes += summary.pendingMinutes;
        fallbackDay.remainingMinutes += summary.pendingMinutes;
        dailyDeadlineQuota = summary.pendingMinutes;
        lastWorkingDateInWindow = earliestOrderDate;
      } else if (workingWindowDates.length > 0) {
        dailyDeadlineQuota =
          Math.round((summary.pendingMinutes / workingWindowDates.length) * 1000) / 1000;
        lastWorkingDateInWindow = workingWindowDates[workingWindowDates.length - 1];

        // Ensure each working day in the window has at least dailyDeadlineQuota remaining capacity
        for (const wd of workingWindowDates) {
          const dp = ensureDayPlan(wd, 0);
          if (dp.remainingMinutes < dailyDeadlineQuota) {
            const neededExtra = Math.ceil((dailyDeadlineQuota - dp.remainingMinutes) * 100) / 100;
            ensureDayPlan(wd, neededExtra);
          }
        }
      }
    }

    let cursorDate = order.receivedDate;

    for (const color of validColors) {
      const colorTotalUnits = getColorTotalUnits(color);
      const orderedSizes = getOrderedColorSizes(color, sizeSortOrder);
      const isSingleUnicaSize =
        orderedSizes.length === 1 && orderedSizes[0].size === 'Única';

      for (let sizeIdx = 0; sizeIdx < orderedSizes.length; sizeIdx += 1) {
        const sizeItem = orderedSizes[sizeIdx];
        const isLastSizeOfColor = sizeIdx === orderedSizes.length - 1;

        for (let opIdx = 0; opIdx < validOps.length; opIdx += 1) {
          const op = validOps[opIdx];
          const isLastOpOfSize = opIdx === validOps.length - 1;
          const isLastOpOfColor = isLastSizeOfColor && isLastOpOfSize;

          const executedUnits = Math.min(
            sizeItem.units,
            getExecutedUnitsForOperation(
              order,
              color.id,
              op.operationId,
              sizeItem.size
            )
          );
          const pendingUnits = Math.max(
            0,
            Math.ceil(sizeItem.units - executedUnits)
          );

          for (const l of logs) {
            const matchesLogSize =
              !l.size ||
              l.size === sizeItem.size ||
              orderedSizes.length === 1;
            if (
              l.colorId === color.id &&
              l.operationId === op.operationId &&
              matchesLogSize &&
              l.shiftRemainingToNextDay
            ) {
              const shiftedDate = addDaysIso(l.reportDate, 1);
              if (shiftedDate > cursorDate) {
                cursorDate = shiftedDate;
              }
            }
          }

          if (pendingUnits <= 0) {
            continue;
          }

          let unitsLeftForOp = pendingUnits;

          let safetyCounter = 0;
          while (unitsLeftForOp > 0 && safetyCounter < 500) {
            safetyCounter += 1;
            const dayPlan = ensureDayPlan(cursorDate);

            // Calculate how many minutes this order is allowed to use on cursorDate
            let availableForOrderToday = dayPlan.remainingMinutes;
            if (
              dailyDeadlineQuota !== null &&
              lastWorkingDateInWindow !== null &&
              cursorDate < lastWorkingDateInWindow
            ) {
              const alreadyUsedTodayForOrder =
                orderPendingUsedByDate.get(cursorDate) ?? 0;
              const remainingQuotaToday = Math.max(
                0,
                dailyDeadlineQuota - alreadyUsedTodayForOrder
              );
              availableForOrderToday = Math.min(
                dayPlan.remainingMinutes,
                remainingQuotaToday
              );
            }

            if (!dayPlan.isWorkingDay || availableForOrderToday <= 0.001) {
              const weeklyTotal = calculateWeeklyMinutes(config);
              if (weeklyTotal <= 0 && !useByDeadlineMode) {
                dayPlan.isWorkingDay = true;
                dayPlan.capacityMinutes = 480;
                dayPlan.remainingMinutes = 480;
                availableForOrderToday = 480;
              } else {
                cursorDate = addDaysIso(cursorDate, 1);
                continue;
              }
            }

            // Always schedule whole integer operation units rounded UP (Math.ceil)
            const rawUnitsForToday = availableForOrderToday / op.minutesPerUnit;
            const unitsAssigned = Math.min(
              unitsLeftForOp,
              Math.max(1, Math.ceil(rawUnitsForToday - 1e-9))
            );
            const allocatedMinutes =
              Math.round(unitsAssigned * op.minutesPerUnit * 100) / 100;
            const startUsed = dayPlan.usedMinutes;
            const clocks = computeClocks(cursorDate, startUsed, allocatedMinutes);

            unitsLeftForOp = Math.max(0, unitsLeftForOp - unitsAssigned);
            dayPlan.usedMinutes =
              Math.round((dayPlan.usedMinutes + allocatedMinutes) * 100) / 100;
            dayPlan.remainingMinutes = Math.max(
              0,
              Math.round((dayPlan.capacityMinutes - dayPlan.usedMinutes) * 100) /
                100
            );
            orderPendingUsedByDate.set(
              cursorDate,
              (orderPendingUsedByDate.get(cursorDate) ?? 0) + allocatedMinutes
            );

            const isOpDone = unitsLeftForOp === 0;
            const isSizeDone = isOpDone && isLastOpOfSize;
            const isColorDone = isOpDone && isLastOpOfColor;

            const taskKey = isSingleUnicaSize
              ? `${order.id}__${color.id}__${op.operationId}__${cursorDate}`
              : `${order.id}__${color.id}__${sizeItem.size}__${op.operationId}__${cursorDate}`;

            const block: ScheduledTaskBlock = {
              taskKey,
              date: cursorDate,
              productionId: order.id,
              garmentName: order.garmentName,
              referenceCode: order.referenceCode,
              colorId: color.id,
              colorName: color.colorName,
              colorHex: color.colorHex,
              size: sizeItem.size,
              totalSizeUnits: sizeItem.units,
              operationId: op.operationId,
              operationName: op.operationName,
              machine: op.machine,
              unitsAssigned,
              totalColorUnits: colorTotalUnits,
              minutesAssigned: Math.round(allocatedMinutes * 100) / 100,
              startClock: clocks.startClock,
              endClock: clocks.endClock,
              isOperationCompletedInThisBlock: isOpDone,
              isSizeCompletedInThisBlock: isSizeDone,
              isColorCompletedInThisBlock: isColorDone,
              isAfterDeadline: cursorDate > order.deliveryDate,
            };

            dayPlan.blocks.push(block);

            if (isColorDone) {
              dayPlan.colorsEvacuated.push({
                productionId: order.id,
                garmentName: order.garmentName,
                colorId: color.id,
                colorName: color.colorName,
                colorHex: color.colorHex,
                totalUnits: colorTotalUnits,
              });
              summaries[order.id].colorCompletionDates[color.id] = cursorDate;
              summaries[order.id].estimatedCompletionDate = cursorDate;
            }
          }
        }
      }
    }
  }

  const allDates = Array.from(dayPlanMap.keys()).sort();
  if (allDates.length > 0) {
    const first = allDates[0];
    const last = allDates[allDates.length - 1];
    for (const dt of listDatesBetweenIso(first, last)) {
      ensureDayPlan(dt, 0);
    }
  }

  const days = Array.from(dayPlanMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return { days, summaries };
}
