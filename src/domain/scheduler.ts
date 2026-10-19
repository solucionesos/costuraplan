import {
  DayPlan,
  DaySchedule,
  DeliveryMode,
  ExecutionLog,
  FullScheduleResult,
  ProductionOrder,
  ProductionScheduleSummary,
  ScheduledTaskBlock,
  WorkshopConfig,
} from './types';

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

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
  operationId: string
): number {
  const logs = order.executionLogs ?? [];
  return logs
    .filter((l) => l.colorId === colorId && l.operationId === operationId)
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

  const alreadyExecuted = getExecutedUnitsForOperation(
    order,
    params.colorId,
    params.operationId
  );
  const maxAllowedUnits = Math.max(0, Math.round((color.units - alreadyExecuted) * 10) / 10);

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

  if (params.unitsExecuted > maxAllowedUnits + 0.01) {
    return {
      valid: false,
      error: `No puedes reportar ${params.unitsExecuted} uds porque solo quedan ${maxAllowedUnits} uds pendientes para ${op.operationName} (${color.colorName}).`,
      noveltyType: 'exact',
      shortfallUnits: 0,
      maxAllowedUnits,
      summaryMessage: '',
    };
  }

  const isAdvance = params.reportDate < params.scheduledSourceDate;
  if (isAdvance && params.unitsExecuted <= 0) {
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
      summaryMessage: `Estás reportando el día ${params.reportDate} un adelanto de ${params.unitsExecuted} uds de "${op.operationName}" (Color ${color.colorName}) que estaba programada para el día ${params.scheduledSourceDate}. Se descontarán estas unidades del día futuro y se recalculará todo el calendario.`,
    };
  }

  const shortfall = Math.max(
    0,
    Math.round((params.plannedUnitsOnBlock - params.unitsExecuted) * 10) / 10
  );

  if (shortfall > 0) {
    return {
      valid: true,
      noveltyType: 'shortfall',
      shortfallUnits: shortfall,
      maxAllowedUnits,
      summaryMessage: `Se ejecutaron ${params.unitsExecuted} uds de las ${params.plannedUnitsOnBlock} uds programadas para el día ${params.reportDate}. Las ${shortfall} unidades faltantes de "${op.operationName}" (Color ${color.colorName}) se trasladarán automáticamente al siguiente día hábil y se reprogramará el calendario.`,
    };
  }

  if (params.unitsExecuted > params.plannedUnitsOnBlock) {
    const extra = Math.round((params.unitsExecuted - params.plannedUnitsOnBlock) * 10) / 10;
    return {
      valid: true,
      noveltyType: 'overproduction',
      shortfallUnits: 0,
      maxAllowedUnits,
      summaryMessage: `Se ejecutaron ${params.unitsExecuted} uds (${extra} uds más de las ${params.plannedUnitsOnBlock} uds programadas el ${params.reportDate}). Se adelantará el saldo restante en el calendario.`,
    };
  }

  return {
    valid: true,
    noveltyType: 'exact',
    shortfallUnits: 0,
    maxAllowedUnits,
    summaryMessage: `Se completaron las ${params.unitsExecuted} uds programadas de "${op.operationName}" (Color ${color.colorName}) en el día ${params.reportDate}.`,
  };
}

export function applyExecutionReportToOrder(
  order: ProductionOrder,
  params: {
    reportDate: string;
    scheduledSourceDate: string;
    colorId: string;
    operationId: string;
    unitsExecuted: number;
    plannedUnitsOnBlock: number;
  }
): ProductionOrder {
  const isShortfall =
    params.reportDate >= params.scheduledSourceDate &&
    params.unitsExecuted < params.plannedUnitsOnBlock;

  const newLog: ExecutionLog = {
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    reportDate: params.reportDate,
    scheduledSourceDate: params.scheduledSourceDate,
    colorId: params.colorId,
    operationId: params.operationId,
    unitsExecuted: Math.round(params.unitsExecuted * 10) / 10,
    plannedUnitsAtReport: params.plannedUnitsOnBlock,
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
  const totalUnits = order.colors.reduce((sum, c) => sum + Math.max(0, c.units), 0);
  const minutesPerUnit = order.operations.reduce((sum, op) => sum + Math.max(0, op.minutesPerUnit), 0);
  const totalRequiredMinutes = Math.round(totalUnits * minutesPerUnit * 100) / 100;

  let executedMinutes = 0;
  for (const color of order.colors) {
    for (const op of order.operations) {
      const doneUnits = Math.min(
        color.units,
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
    const logs = [...(order.executionLogs ?? [])].sort((a, b) =>
      a.reportDate.localeCompare(b.reportDate)
    );

    const runningUnitsByKey = new Map<string, number>();

    for (const log of logs) {
      const color = order.colors.find((c) => c.id === log.colorId);
      const op = order.operations.find((o) => o.operationId === log.operationId);
      if (!color || !op) continue;

      const key = `${color.id}__${op.operationId}`;
      const prevDone = runningUnitsByKey.get(key) ?? 0;
      const effectiveUnits = Math.max(0, Math.min(color.units - prevDone, log.unitsExecuted));
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

      const isOpDone = newDone >= color.units - 0.001;
      const isAdvance = Boolean(
        log.scheduledSourceDate && log.scheduledSourceDate > log.reportDate
      );
      const shortfallMoved =
        log.shiftRemainingToNextDay &&
        log.plannedUnitsAtReport !== undefined &&
        log.unitsExecuted < log.plannedUnitsAtReport
          ? Math.round((log.plannedUnitsAtReport - log.unitsExecuted) * 10) / 10
          : 0;

      const allColorOpsDone =
        isOpDone &&
        order.operations.every((candidateOp) => {
          const totalForCandidate =
            candidateOp.operationId === op.operationId
              ? newDone
              : getExecutedUnitsForOperation(order, color.id, candidateOp.operationId);
          return totalForCandidate >= color.units - 0.001;
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
          operationId: op.operationId,
          operationName: op.operationName,
          machine: op.machine,
          unitsAssigned: effectiveUnits,
          unitsExecuted: effectiveUnits,
          shortfallUnitsMovedNextDay: shortfallMoved,
          totalColorUnits: color.units,
          minutesAssigned: allocatedMinutes,
          startClock: clocks.startClock,
          endClock: clocks.endClock,
          isOperationCompletedInThisBlock: isOpDone,
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
          totalUnits: color.units,
        });
        summaries[order.id].colorCompletionDates[color.id] = log.reportDate;
        summaries[order.id].estimatedCompletionDate = log.reportDate;
      }
    }
  }

  // STEP 2: Schedule remaining pending units per (color, operation) evacuating Color by Color
  for (const order of sortedOrders) {
    const validOps = order.operations.filter((op) => op.minutesPerUnit > 0);
    const validColors = order.colors.filter((c) => c.units > 0);
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
      for (let opIdx = 0; opIdx < validOps.length; opIdx += 1) {
        const op = validOps[opIdx];
        const isLastOpOfColor = opIdx === validOps.length - 1;

        const executedUnits = Math.min(
          color.units,
          getExecutedUnitsForOperation(order, color.id, op.operationId)
        );
        const pendingUnits = Math.max(
          0,
          Math.round((color.units - executedUnits) * 1000) / 1000
        );

        for (const l of logs) {
          if (
            l.colorId === color.id &&
            l.operationId === op.operationId &&
            l.shiftRemainingToNextDay
          ) {
            const shiftedDate = addDaysIso(l.reportDate, 1);
            if (shiftedDate > cursorDate) {
              cursorDate = shiftedDate;
            }
          }
        }

        if (pendingUnits <= 0.001) {
          continue;
        }

        let minutesLeftForOp = Math.round(pendingUnits * op.minutesPerUnit * 1000) / 1000;

        let safetyCounter = 0;
        while (minutesLeftForOp > 0.001 && safetyCounter < 500) {
          safetyCounter += 1;
          const dayPlan = ensureDayPlan(cursorDate);

          // Calculate how many minutes this order is allowed to use on cursorDate
          let availableForOrderToday = dayPlan.remainingMinutes;
          if (
            dailyDeadlineQuota !== null &&
            lastWorkingDateInWindow !== null &&
            cursorDate < lastWorkingDateInWindow
          ) {
            const alreadyUsedTodayForOrder = orderPendingUsedByDate.get(cursorDate) ?? 0;
            const remainingQuotaToday = Math.max(
              0,
              dailyDeadlineQuota - alreadyUsedTodayForOrder
            );
            availableForOrderToday = Math.min(dayPlan.remainingMinutes, remainingQuotaToday);
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

          const allocatedMinutes = Math.min(availableForOrderToday, minutesLeftForOp);
          const startUsed = dayPlan.usedMinutes;
          const clocks = computeClocks(cursorDate, startUsed, allocatedMinutes);

          minutesLeftForOp = Math.max(
            0,
            Math.round((minutesLeftForOp - allocatedMinutes) * 1000) / 1000
          );
          dayPlan.usedMinutes = Math.round((dayPlan.usedMinutes + allocatedMinutes) * 100) / 100;
          dayPlan.remainingMinutes = Math.max(
            0,
            Math.round((dayPlan.capacityMinutes - dayPlan.usedMinutes) * 100) / 100
          );
          orderPendingUsedByDate.set(
            cursorDate,
            (orderPendingUsedByDate.get(cursorDate) ?? 0) + allocatedMinutes
          );

          const isOpDone = minutesLeftForOp <= 0.001;
          const isColorDone = isOpDone && isLastOpOfColor;
          const unitsAssigned = Math.round((allocatedMinutes / op.minutesPerUnit) * 10) / 10;

          const block: ScheduledTaskBlock = {
            taskKey: `${order.id}__${color.id}__${op.operationId}__${cursorDate}`,
            date: cursorDate,
            productionId: order.id,
            garmentName: order.garmentName,
            referenceCode: order.referenceCode,
            colorId: color.id,
            colorName: color.colorName,
            colorHex: color.colorHex,
            operationId: op.operationId,
            operationName: op.operationName,
            machine: op.machine,
            unitsAssigned,
            totalColorUnits: color.units,
            minutesAssigned: Math.round(allocatedMinutes * 100) / 100,
            startClock: clocks.startClock,
            endClock: clocks.endClock,
            isOperationCompletedInThisBlock: isOpDone,
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
              totalUnits: color.units,
            });
            summaries[order.id].colorCompletionDates[color.id] = cursorDate;
            summaries[order.id].estimatedCompletionDate = cursorDate;
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
