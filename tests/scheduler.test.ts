import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  applyExecutionReportToOrder,
  buildProductionSchedule,
  calculateDayAvailableMinutes,
  calculateWeeklyMinutes,
  cleanAdvancedWorkFromOrders,
  evaluateProductionSummary,
  formatDurationHuman,
  formatIsoDateUTC,
  formatMinutesToClock,
  getAvailableMinutesForDate,
  getDayOfWeekIso,
  getDayScheduleForDate,
  getOrderedColorSizes,
  getSizeRank,
  listDatesBetweenIso,
  parseIsoDateUTC,
  parseTimeToMinutes,
  removeExecutionLog,
  reorderProductionOperations,
  sortSizes,
  validateExecutionReport,
} from '../src/domain/scheduler';
import {
  createSampleProductionOrder,
  DEFAULT_WORKSHOP_CONFIG,
} from '../src/domain/defaults';
import { ProductionOrder, WorkshopConfig } from '../src/domain/types';

describe('Time & Date helpers', () => {
  it('parses valid and invalid clock strings', () => {
    expect(parseTimeToMinutes('07:30')).toBe(450);
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
    expect(parseTimeToMinutes('invalid')).toBe(0);
    expect(parseTimeToMinutes('25:00')).toBe(0);
    expect(parseTimeToMinutes('10:65')).toBe(0);
    expect(parseTimeToMinutes('-1:10')).toBe(0);
  });

  it('formats minutes to HH:MM clock', () => {
    expect(formatMinutesToClock(450)).toBe('07:30');
    expect(formatMinutesToClock(-15)).toBe('00:00');
    expect(formatMinutesToClock(2000)).toBe('23:59');
  });

  it('calculates daily and weekly available minutes accurately', () => {
    expect(
      calculateDayAvailableMinutes({
        dayOfWeek: 1,
        name: 'Lunes',
        enabled: true,
        startTime: '07:00',
        endTime: '17:00',
        breakMinutes: 60,
      })
    ).toBe(540);

    expect(
      calculateDayAvailableMinutes({
        dayOfWeek: 0,
        name: 'Domingo',
        enabled: false,
        startTime: '07:00',
        endTime: '17:00',
        breakMinutes: 0,
      })
    ).toBe(0);

    expect(
      calculateDayAvailableMinutes({
        dayOfWeek: 2,
        name: 'Martes',
        enabled: true,
        startTime: '17:00',
        endTime: '07:00',
        breakMinutes: 0,
      })
    ).toBe(0);

    expect(calculateWeeklyMinutes(DEFAULT_WORKSHOP_CONFIG)).toBe(3060);
  });

  it('formats human-readable durations', () => {
    expect(formatDurationHuman(0)).toBe('0 min');
    expect(formatDurationHuman(-5)).toBe('0 min');
    expect(formatDurationHuman(0.5)).toBe('30 seg');
    expect(formatDurationHuman(45)).toBe('45 min');
    expect(formatDurationHuman(120)).toBe('2h');
    expect(formatDurationHuman(150)).toBe('2h 30m');
  });

  it('handles ISO dates and non-working holidays', () => {
    const dt = parseIsoDateUTC('2026-10-19');
    expect(formatIsoDateUTC(dt)).toBe('2026-10-19');
    expect(addDaysIso('2026-10-19', 2)).toBe('2026-10-21');
    expect(getDayOfWeekIso('2026-10-19')).toBe(1);
    expect(listDatesBetweenIso('2026-10-21', '2026-10-19')).toEqual([]);
    expect(listDatesBetweenIso('2026-10-19', '2026-10-21')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ]);

    const cfgWithHoliday: WorkshopConfig = {
      ...DEFAULT_WORKSHOP_CONFIG,
      nonWorkingDates: ['2026-10-19'],
    };
    expect(getAvailableMinutesForDate('2026-10-19', cfgWithHoliday)).toBe(0);
    expect(getAvailableMinutesForDate('2026-10-20', cfgWithHoliday)).toBe(540);

    const emptyDaysConfig: WorkshopConfig = { days: [], nonWorkingDates: [] };
    const fallbackDay = getDayScheduleForDate('2026-10-19', emptyDaysConfig);
    expect(fallbackDay.enabled).toBe(false);
    expect(fallbackDay.name).toBe('Lunes');

    const demoOrder = createSampleProductionOrder('2026-10-19', '2026-10-24');
    expect(demoOrder.colors.length).toBe(3);
  });
});

describe('Color-Batch Evacuation & Dynamic Re-Scheduling Engine', () => {
  const sampleOrder: ProductionOrder = {
    id: 'ord-1',
    garmentName: 'Camibuso Polo',
    referenceCode: 'POLO-01',
    receivedDate: '2026-10-19',
    deliveryDate: '2026-10-21',
    colors: [
      { id: 'c-azul', colorName: 'Azul', colorHex: '#2563EB', units: 100 },
      { id: 'c-rojo', colorName: 'Rojo', colorHex: '#DC2626', units: 100 },
    ],
    operations: [
      { operationId: 'op-a', operationName: 'Filetear hombros', machine: 'Fileteadora', minutesPerUnit: 3 },
      { operationId: 'op-b', operationName: 'Pegar cuello', machine: 'Collarín', minutesPerUnit: 3 },
    ],
    completedTaskKeys: [],
    createdAt: '2026-10-19',
  };

  it('evaluates production summary accurately', () => {
    const summary = evaluateProductionSummary(sampleOrder, DEFAULT_WORKSHOP_CONFIG);
    expect(summary.totalUnits).toBe(200);
    expect(summary.minutesPerUnit).toBe(6);
    expect(summary.totalRequiredMinutes).toBe(1200);
    expect(summary.availableMinutesBeforeDeadline).toBe(1620);
    expect(summary.workingDaysBeforeDeadline).toBe(3);
    expect(summary.isFeasibleOnSchedule).toBe(true);
    expect(summary.deficitMinutes).toBe(0);
  });

  it('evacuates 100% of first color before starting second color across multiple days', () => {
    const result = buildProductionSchedule([sampleOrder], DEFAULT_WORKSHOP_CONFIG, { mode: 'standard' });
    expect(result.days.length).toBeGreaterThanOrEqual(3);

    const monday = result.days.find((d) => d.date === '2026-10-19')!;
    expect(monday.blocks).toHaveLength(2);
    expect(monday.blocks[0].colorName).toBe('Azul');
    expect(monday.blocks[0].operationId).toBe('op-a');
    expect(monday.blocks[0].minutesAssigned).toBe(300);
    expect(monday.blocks[0].isOperationCompletedInThisBlock).toBe(true);
    expect(monday.blocks[0].isColorCompletedInThisBlock).toBe(false);

    expect(monday.blocks[1].colorName).toBe('Azul');
    expect(monday.blocks[1].operationId).toBe('op-b');
    expect(monday.blocks[1].minutesAssigned).toBe(240);
    expect(monday.blocks[1].unitsAssigned).toBe(80);
    expect(monday.blocks[1].isOperationCompletedInThisBlock).toBe(false);
    expect(monday.colorsEvacuated).toHaveLength(0);

    const tuesday = result.days.find((d) => d.date === '2026-10-20')!;
    expect(tuesday.blocks[0].colorName).toBe('Azul');
    expect(tuesday.blocks[0].operationId).toBe('op-b');
    expect(tuesday.blocks[0].minutesAssigned).toBe(60);
    expect(tuesday.blocks[0].unitsAssigned).toBe(20);
    expect(tuesday.blocks[0].isColorCompletedInThisBlock).toBe(true);
    expect(tuesday.colorsEvacuated).toHaveLength(1);
    expect(tuesday.colorsEvacuated[0].colorName).toBe('Azul');

    expect(tuesday.blocks[1].colorName).toBe('Rojo');
    expect(tuesday.blocks[1].operationId).toBe('op-a');
    expect(tuesday.blocks[1].minutesAssigned).toBe(300);

    const wednesday = result.days.find((d) => d.date === '2026-10-21')!;
    expect(wednesday.blocks[0].colorName).toBe('Rojo');
    expect(wednesday.blocks[0].isColorCompletedInThisBlock).toBe(true);
    expect(wednesday.colorsEvacuated[0].colorName).toBe('Rojo');
  });

  it('automatically shifts shortfall units to the next day when fewer operations are executed than programmed', () => {
    // On 2026-10-19, 100 units of c-azul / op-a were programmed.
    // User reports only 60 units executed on 2026-10-19 (40 units shortfall).
    const validation = validateExecutionReport(sampleOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-19',
      colorId: 'c-azul',
      operationId: 'op-a',
      unitsExecuted: 60,
      plannedUnitsOnBlock: 100,
    });
    expect(validation.valid).toBe(true);
    expect(validation.noveltyType).toBe('shortfall');
    expect(validation.shortfallUnits).toBe(40);

    const updatedOrder = applyExecutionReportToOrder(sampleOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-19',
      colorId: 'c-azul',
      operationId: 'op-a',
      unitsExecuted: 60,
      plannedUnitsOnBlock: 100,
    });

    const rescheduled = buildProductionSchedule([updatedOrder], DEFAULT_WORKSHOP_CONFIG, {
      mode: 'standard',
    });

    const monday = rescheduled.days.find((d) => d.date === '2026-10-19')!;
    // Monday now only has the 60 executed units of op-a, and the 40 remaining shifted to Tuesday!
    expect(monday.blocks).toHaveLength(1);
    expect(monday.blocks[0].isExecutedReport).toBe(true);
    expect(monday.blocks[0].unitsExecuted).toBe(60);
    expect(monday.blocks[0].shortfallUnitsMovedNextDay).toBe(40);

    const tuesday = rescheduled.days.find((d) => d.date === '2026-10-20')!;
    // Tuesday starts with the 40 missing units of op-a!
    expect(tuesday.blocks[0].operationId).toBe('op-a');
    expect(tuesday.blocks[0].unitsAssigned).toBe(40);
    expect(tuesday.blocks[0].isExecutedReport).toBeUndefined();
  });

  it('recalculates entire schedule when advancing an operation from a future day (e.g. 21/10 reported on 19/10)', () => {
    // User is on 2026-10-19 and advances 50 units of Color Rojo / op-b scheduled for 2026-10-21
    const validation = validateExecutionReport(sampleOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-21',
      colorId: 'c-rojo',
      operationId: 'op-b',
      unitsExecuted: 50,
      plannedUnitsOnBlock: 40,
    });
    expect(validation.valid).toBe(true);
    expect(validation.noveltyType).toBe('advance');

    const updatedOrder = applyExecutionReportToOrder(sampleOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-21',
      colorId: 'c-rojo',
      operationId: 'op-b',
      unitsExecuted: 50,
      plannedUnitsOnBlock: 40,
    });

    const rescheduled = buildProductionSchedule([updatedOrder], DEFAULT_WORKSHOP_CONFIG, {
      mode: 'standard',
    });

    // Monday 2026-10-19 has the advanced execution block of 50 units (150 min)
    const monday = rescheduled.days.find((d) => d.date === '2026-10-19')!;
    const advancedBlock = monday.blocks.find((b) => b.isExecutedReport)!;
    expect(advancedBlock).toBeDefined();
    expect(advancedBlock.isAdvanceFromFuture).toBe(true);
    expect(advancedBlock.scheduledSourceDate).toBe('2026-10-21');
    expect(advancedBlock.unitsExecuted).toBe(50);

    // Total remaining units for c-rojo / op-b across the rest of the calendar should now be 100 - 50 = 50 units
    const remainingRojoOpB = rescheduled.days
      .flatMap((d) => d.blocks)
      .filter(
        (b) =>
          !b.isExecutedReport &&
          b.colorId === 'c-rojo' &&
          b.operationId === 'op-b'
      )
      .reduce((sum, b) => sum + b.unitsAssigned, 0);
    expect(remainingRojoOpB).toBe(50);

    // Test removing execution log
    const logId = updatedOrder.executionLogs![0].id;
    const restoredOrder = removeExecutionLog(updatedOrder, logId);
    expect(restoredOrder.executionLogs).toHaveLength(0);
  });

  it('validates edge cases in validateExecutionReport (overproduction, exact, invalid inputs)', () => {
    expect(
      validateExecutionReport(sampleOrder, {
        reportDate: '2026-10-19',
        scheduledSourceDate: '2026-10-19',
        colorId: 'non-existent',
        operationId: 'op-a',
        unitsExecuted: 10,
        plannedUnitsOnBlock: 10,
      }).valid
    ).toBe(false);

    expect(
      validateExecutionReport(sampleOrder, {
        reportDate: '2026-10-15', // before receivedDate
        scheduledSourceDate: '2026-10-19',
        colorId: 'c-azul',
        operationId: 'op-a',
        unitsExecuted: 10,
        plannedUnitsOnBlock: 10,
      }).valid
    ).toBe(false);

    expect(
      validateExecutionReport(sampleOrder, {
        reportDate: '2026-10-19',
        scheduledSourceDate: '2026-10-19',
        colorId: 'c-azul',
        operationId: 'op-a',
        unitsExecuted: -5,
        plannedUnitsOnBlock: 10,
      }).valid
    ).toBe(false);

    expect(
      validateExecutionReport(sampleOrder, {
        reportDate: '2026-10-19',
        scheduledSourceDate: '2026-10-19',
        colorId: 'c-azul',
        operationId: 'op-a',
        unitsExecuted: 500, // exceeds 100
        plannedUnitsOnBlock: 100,
      }).valid
    ).toBe(false);

    expect(
      validateExecutionReport(sampleOrder, {
        reportDate: '2026-10-19',
        scheduledSourceDate: '2026-10-21',
        colorId: 'c-azul',
        operationId: 'op-a',
        unitsExecuted: 0, // 0 units on advance
        plannedUnitsOnBlock: 50,
      }).valid
    ).toBe(false);

    const overprod = validateExecutionReport(sampleOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-19',
      colorId: 'c-azul',
      operationId: 'op-b',
      unitsExecuted: 95,
      plannedUnitsOnBlock: 80,
    });
    expect(overprod.valid).toBe(true);
    expect(overprod.noveltyType).toBe('overproduction');

    const exact = validateExecutionReport(sampleOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-19',
      colorId: 'c-azul',
      operationId: 'op-a',
      unitsExecuted: 100,
      plannedUnitsOnBlock: 100,
    });
    expect(exact.valid).toBe(true);
    expect(exact.noveltyType).toBe('exact');
  });

  it('handles fit-deadline mode and full color completion via execution logs', () => {
    let fullDoneOrder = applyExecutionReportToOrder(sampleOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-19',
      colorId: 'c-azul',
      operationId: 'op-a',
      unitsExecuted: 100,
      plannedUnitsOnBlock: 100,
    });
    fullDoneOrder = applyExecutionReportToOrder(fullDoneOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-19',
      colorId: 'c-azul',
      operationId: 'op-b',
      unitsExecuted: 100,
      plannedUnitsOnBlock: 80,
    });

    const fitResult = buildProductionSchedule([fullDoneOrder], DEFAULT_WORKSHOP_CONFIG, {
      mode: 'fit-deadline',
    });
    expect(fitResult.summaries['ord-1'].colorCompletionDates['c-azul']).toBe('2026-10-19');

    const tightOrder: ProductionOrder = {
      ...sampleOrder,
      id: 'ord-tight',
      receivedDate: '2026-10-19',
      deliveryDate: '2026-10-19',
    };
    const tightFitResult = buildProductionSchedule([tightOrder], DEFAULT_WORKSHOP_CONFIG, {
      mode: 'fit-deadline',
    });
    expect(tightFitResult.summaries['ord-tight'].estimatedCompletionDate).toBe('2026-10-19');
  });

  it('handles empty orders and disabled schedules safely', () => {
    expect(buildProductionSchedule([], DEFAULT_WORKSHOP_CONFIG).days).toEqual([]);

    const disabledConfig: WorkshopConfig = {
      days: DEFAULT_WORKSHOP_CONFIG.days.map((d) => ({ ...d, enabled: false })),
      nonWorkingDates: [],
    };

    const resStandard = buildProductionSchedule([sampleOrder], disabledConfig, { mode: 'standard' });
    expect(resStandard.days.length).toBeGreaterThan(0);

    const resFit = buildProductionSchedule([sampleOrder], disabledConfig, { mode: 'fit-deadline' });
    expect(resFit.days.length).toBeGreaterThan(0);
  });

  it('reorders operations by dragging/moving priority and recalculates schedule', () => {
    const reordered = reorderProductionOperations(sampleOrder, 0, 1);
    expect(reordered.operations[0].operationId).toBe('op-b');
    expect(reordered.operations[1].operationId).toBe('op-a');

    // Out-of-bounds or same index returns unchanged order
    expect(reorderProductionOperations(sampleOrder, 0, 0)).toBe(sampleOrder);
    expect(reorderProductionOperations(sampleOrder, -1, 1)).toBe(sampleOrder);

    const scheduleAfterReorder = buildProductionSchedule(
      [reordered],
      DEFAULT_WORKSHOP_CONFIG
    );
    const monday = scheduleAfterReorder.days.find((d) => d.date === '2026-10-19')!;
    expect(monday.blocks[0].operationId).toBe('op-b');
  });

  it('distributes operations across all working days of the plazo when deliveryMode is by-deadline even if fewer hours per day are needed', () => {
    // Light order requiring only 300 minutes total (50 units * 6 min/unit) over 3 working days (Mon, Tue, Wed)
    const lightOrderByDeadline: ProductionOrder = {
      ...sampleOrder,
      id: 'ord-light-deadline',
      deliveryMode: 'by-deadline',
      colors: [{ id: 'c-1', colorName: 'Blanco', colorHex: '#FFFFFF', units: 50 }],
    };

    const resByDeadline = buildProductionSchedule(
      [lightOrderByDeadline],
      DEFAULT_WORKSHOP_CONFIG
    );
    // 300 min / 3 days = 100 min quota per day on Mon, Tue, and Wed!
    // Since op-a takes 3 min/unit, 100 / 3 = 33.333... uds -> rounded UP (Math.ceil) to 34 uds (102 min) on Mon!
    // On Tue: remaining 16 uds of op-a (48 min) + ceil((100 - 48) / 3) = 18 uds of op-b (54 min) = 102 min!
    // On Wed: remaining 32 uds of op-b (96 min)!
    const mon = resByDeadline.days.find((d) => d.date === '2026-10-19')!;
    const tue = resByDeadline.days.find((d) => d.date === '2026-10-20')!;
    const wed = resByDeadline.days.find((d) => d.date === '2026-10-21')!;
    expect(mon.blocks[0].unitsAssigned).toBe(34);
    expect(mon.usedMinutes).toBe(102);
    expect(tue.usedMinutes).toBe(102);
    expect(wed.usedMinutes).toBe(96);
    expect(resByDeadline.summaries['ord-light-deadline'].estimatedCompletionDate).toBe(
      '2026-10-21'
    );

    // Compare with 'asap' mode: finishes all 300 min on Monday!
    const lightOrderAsap: ProductionOrder = {
      ...lightOrderByDeadline,
      id: 'ord-light-asap',
      deliveryMode: 'asap',
    };
    const resAsap = buildProductionSchedule([lightOrderAsap], DEFAULT_WORKSHOP_CONFIG);
    const monAsap = resAsap.days.find((d) => d.date === '2026-10-19')!;
    expect(monAsap.usedMinutes).toBe(300);
    expect(resAsap.summaries['ord-light-asap'].estimatedCompletionDate).toBe(
      '2026-10-19'
    );
  });

  it('evacuates each color and within each color organizes by size in ascending or descending order (including Talla Única)', () => {
    expect(getSizeRank('Única')).toBe(0);
    expect(getSizeRank('8')).toBeLessThan(getSizeRank('12'));
    expect(getSizeRank('S')).toBeLessThan(getSizeRank('XL'));
    expect(getSizeRank('Especial-A')).toBe(500);

    const mixedSizes = [
      { size: 'XL', units: 10 },
      { size: 'S', units: 20 },
      { size: 'Única', units: 5 },
      { size: 'M', units: 15 },
      { size: '8', units: 10 },
      { size: 'Especial-B', units: 5 },
      { size: 'Especial-A', units: 5 },
    ];

    const asc = sortSizes(mixedSizes, 'asc').map((s) => s.size);
    expect(asc).toEqual([
      'Única',
      '8',
      'S',
      'M',
      'XL',
      'Especial-A',
      'Especial-B',
    ]);

    const desc = sortSizes(mixedSizes, 'desc').map((s) => s.size);
    expect(desc).toEqual([
      'Especial-B',
      'Especial-A',
      'XL',
      'M',
      'S',
      '8',
      'Única',
    ]);

    const multiSizeOrderAsc: ProductionOrder = {
      ...sampleOrder,
      id: 'ord-sizes-asc',
      sizeSortOrder: 'asc',
      colors: [
        {
          id: 'c-blanco',
          colorName: 'Blanco',
          colorHex: '#FFFFFF',
          units: 60,
          sizes: [
            { size: 'L', units: 20 },
            { size: 'S', units: 20 },
            { size: 'M', units: 20 },
          ],
        },
        {
          id: 'c-negro',
          colorName: 'Negro',
          colorHex: '#000000',
          units: 30,
          sizes: [{ size: 'Única', units: 30 }],
        },
      ],
    };

    const schedAsc = buildProductionSchedule(
      [multiSizeOrderAsc],
      DEFAULT_WORKSHOP_CONFIG
    );
    const monAsc = schedAsc.days.find((d) => d.date === '2026-10-19')!;
    const blancoSizesAsc = monAsc.blocks
      .filter((b) => b.colorId === 'c-blanco' && b.operationId === 'op-a')
      .map((b) => b.size);
    expect(blancoSizesAsc).toEqual(['S', 'M', 'L']);

    // Now test Descendente ('desc')
    const multiSizeOrderDesc: ProductionOrder = {
      ...multiSizeOrderAsc,
      id: 'ord-sizes-desc',
      sizeSortOrder: 'desc',
    };
    const schedDesc = buildProductionSchedule(
      [multiSizeOrderDesc],
      DEFAULT_WORKSHOP_CONFIG
    );
    const monDesc = schedDesc.days.find((d) => d.date === '2026-10-19')!;
    const blancoSizesDesc = monDesc.blocks
      .filter((b) => b.colorId === 'c-blanco' && b.operationId === 'op-a')
      .map((b) => b.size);
    expect(blancoSizesDesc).toEqual(['L', 'M', 'S']);

    // Validate & apply execution report for a specific size
    const valSize = validateExecutionReport(multiSizeOrderDesc, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-19',
      colorId: 'c-blanco',
      size: 'L',
      operationId: 'op-a',
      unitsExecuted: 15,
      plannedUnitsOnBlock: 20,
    });
    expect(valSize.valid).toBe(true);
    expect(valSize.shortfallUnits).toBe(5);

    const updatedWithSizeReport = applyExecutionReportToOrder(
      multiSizeOrderDesc,
      {
        reportDate: '2026-10-19',
        scheduledSourceDate: '2026-10-19',
        colorId: 'c-blanco',
        size: 'L',
        operationId: 'op-a',
        unitsExecuted: 15,
        plannedUnitsOnBlock: 20,
      }
    );
    const schedAfterSizeReport = buildProductionSchedule(
      [updatedWithSizeReport],
      DEFAULT_WORKSHOP_CONFIG
    );
    const tueDesc = schedAfterSizeReport.days.find(
      (d) => d.date === '2026-10-20'
    )!;
    expect(
      tueDesc.blocks.some(
        (b) =>
          b.colorId === 'c-blanco' &&
          b.size === 'L' &&
          b.operationId === 'op-a' &&
          b.unitsAssigned === 5
      )
    ).toBe(true);

    // Fallback when color has no sizes array
    expect(
      getOrderedColorSizes({
        id: 'c-x',
        colorName: 'Gris',
        colorHex: '#ccc',
        units: 25,
      })
    ).toEqual([{ size: 'Única', units: 25 }]);
  });

  it('always schedules whole integer operation units rounded UP (Math.ceil) and never fractional/decimal operations', () => {
    // 540 min capacity on Monday. If an operation takes 7 min/unit and has 100 units:
    // 540 / 7 = 77.1428... units -> must round UP (Math.ceil) to 78 integer units on Monday,
    // leaving 22 integer units on Tuesday!
    const nonDivisibleOrder: ProductionOrder = {
      ...sampleOrder,
      id: 'ord-ceil-int',
      colors: [{ id: 'c-1', colorName: 'Verde', colorHex: '#16A34A', units: 100 }],
      operations: [
        {
          operationId: 'op-7min',
          operationName: 'Operación 7 min',
          machine: 'Plana',
          minutesPerUnit: 7,
        },
      ],
    };

    const res = buildProductionSchedule([nonDivisibleOrder], DEFAULT_WORKSHOP_CONFIG);
    const allBlocks = res.days.flatMap((d) => d.blocks);
    expect(allBlocks.length).toBe(2);
    for (const block of allBlocks) {
      expect(Number.isInteger(block.unitsAssigned)).toBe(true);
    }
    expect(allBlocks[0].unitsAssigned).toBe(78); // ceil(540 / 7) = 78
    expect(allBlocks[1].unitsAssigned).toBe(22); // 100 - 78 = 22
  });

  it('automatically shifts unexecuted operations from past days forward to referenceDate (today)', () => {
    // Order received on 2026-10-15 (in the past), with no execution logs
    const pastOrder: ProductionOrder = {
      ...sampleOrder,
      id: 'ord-past',
      receivedDate: '2026-10-15',
      deliveryDate: '2026-10-25',
    };

    // When referenceDate is 2026-10-20, all unexecuted operations must be scheduled on or after 2026-10-20
    const scheduleWithToday = buildProductionSchedule([pastOrder], DEFAULT_WORKSHOP_CONFIG, {
      referenceDate: '2026-10-20',
    });

    const datesWithBlocks = scheduleWithToday.days
      .filter((d) => d.blocks.length > 0)
      .map((d) => d.date);

    for (const dt of datesWithBlocks) {
      expect(dt >= '2026-10-20').toBe(true);
    }
  });

  it('avoids atomization in by-deadline mode with small orders and strictly respects workshop capacity', () => {
    // Order with only 60 total minutes across 5 days: should not be fragmented into 12 min/day!
    const tinyByDeadlineOrder: ProductionOrder = {
      ...sampleOrder,
      id: 'ord-tiny-deadline',
      deliveryMode: 'by-deadline',
      colors: [{ id: 'c-1', colorName: 'Azul', colorHex: '#000', units: 10 }],
      operations: [
        {
          operationId: 'op-6min',
          operationName: 'Op 6 min',
          machine: 'Plana',
          minutesPerUnit: 6,
        },
      ],
      receivedDate: '2026-10-19',
      deliveryDate: '2026-10-23',
    };

    const res = buildProductionSchedule([tinyByDeadlineOrder], DEFAULT_WORKSHOP_CONFIG);
    const scheduledDays = res.days.filter((d) => d.blocks.length > 0);
    // Should be completed in 1 single day of 60 min rather than split across 5 tiny days
    expect(scheduledDays.length).toBe(1);
    expect(scheduledDays[0].blocks[0].unitsAssigned).toBe(10);
    expect(scheduledDays[0].usedMinutes).toBe(60);

    // Medium order: 200 min across 5 days (avg 40 min < 60 min floor -> floor 60 min/day applies)
    const mediumByDeadlineOrder: ProductionOrder = {
      ...sampleOrder,
      id: 'ord-med-deadline',
      deliveryMode: 'by-deadline',
      colors: [{ id: 'c-1', colorName: 'Azul', colorHex: '#000', units: 40 }],
      operations: [
        {
          operationId: 'op-5min',
          operationName: 'Op 5 min',
          machine: 'Plana',
          minutesPerUnit: 5,
        },
      ],
      receivedDate: '2026-10-19',
      deliveryDate: '2026-10-23',
    };

    const resMed = buildProductionSchedule([mediumByDeadlineOrder], DEFAULT_WORKSHOP_CONFIG);
    for (const d of resMed.days) {
      // Must never exceed the day's capacity
      expect(d.usedMinutes).toBeLessThanOrEqual(d.capacityMinutes);
    }
    // Total scheduled units must equal total order units
    const totalMedUnits = resMed.days
      .flatMap((d) => d.blocks)
      .reduce((s, b) => s + b.unitsAssigned, 0);
    expect(totalMedUnits).toBe(40);
    // Complete by deadline
    expect(resMed.summaries['ord-med-deadline'].estimatedCompletionDate! <= '2026-10-23').toBe(true);
  });

  it('cleans advanced work and recalculates schedule from today as if nothing was advanced', () => {
    // Start with sampleOrder and add an advance log (reported on 2026-10-19 for scheduled 2026-10-21)
    const orderWithAdvance = applyExecutionReportToOrder(sampleOrder, {
      reportDate: '2026-10-19',
      scheduledSourceDate: '2026-10-21',
      colorId: 'c-rojo',
      operationId: 'op-b',
      unitsExecuted: 50,
      plannedUnitsOnBlock: 40,
    });

    expect(orderWithAdvance.executionLogs).toHaveLength(1);
    expect(orderWithAdvance.executionLogs![0].scheduledSourceDate).toBe('2026-10-21');

    // cleanAdvancedWorkFromOrders / transferAdvancedWorkToExecutionDate does not delete the advance log;
    // it transfers it to the date it was executed (today: 2026-10-19)
    const transferredOrders = cleanAdvancedWorkFromOrders([orderWithAdvance], '2026-10-19');
    expect(transferredOrders[0].executionLogs).toHaveLength(1);
    expect(transferredOrders[0].executionLogs![0].reportDate).toBe('2026-10-19');
    expect(transferredOrders[0].executionLogs![0].scheduledSourceDate).toBe('2026-10-21');

    // On today (2026-10-19), the advance block is placed as executed advance
    const transferredSchedule = buildProductionSchedule(transferredOrders, DEFAULT_WORKSHOP_CONFIG, {
      referenceDate: '2026-10-19',
    });

    const todayPlan = transferredSchedule.days.find((d) => d.date === '2026-10-19');
    expect(todayPlan).toBeDefined();
    const advanceBlockOnToday = todayPlan!.blocks.find((b) => b.isAdvanceFromFuture);
    expect(advanceBlockOnToday).toBeDefined();
    expect(advanceBlockOnToday!.unitsExecuted).toBe(50);

    // On the scheduled day (2026-10-21), only the remaining 50 units are scheduled
    const totalRojoOpB = transferredSchedule.days
      .flatMap((d) => d.blocks)
      .filter((b) => b.colorId === 'c-rojo' && b.operationId === 'op-b' && !b.isExecutedReport)
      .reduce((sum, b) => sum + b.unitsAssigned, 0);

    expect(totalRojoOpB).toBe(50);

    // Testing option ignoreAdvances: true directly if needed
    const directIgnoredSchedule = buildProductionSchedule(
      [orderWithAdvance],
      DEFAULT_WORKSHOP_CONFIG,
      {
        referenceDate: '2026-10-19',
        ignoreAdvances: true,
      }
    );
    const totalIgnored = directIgnoredSchedule.days
      .flatMap((d) => d.blocks)
      .filter((b) => b.colorId === 'c-rojo' && b.operationId === 'op-b')
      .reduce((sum, b) => sum + b.unitsAssigned, 0);
    expect(totalIgnored).toBe(100);
  });

  it('guarantees tomorrow starts clean at 07:00 and transfers advanced work to execution date without deleting it', () => {
    const today = '2026-10-19';
    const tomorrow = '2026-10-20';
    const sample = createSampleProductionOrder(today, '2026-10-23');

    // Simulate user having execution logs reported on tomorrow
    const orderWithFutureLogs: ProductionOrder = {
      ...sample,
      completedTaskKeys: ['exec__future-1'],
      executionLogs: [
        {
          id: 'future-1',
          reportDate: tomorrow,
          scheduledSourceDate: tomorrow,
          colorId: sample.colors[0].id,
          operationId: sample.operations[0].operationId,
          unitsExecuted: 10,
          shiftRemainingToNextDay: false,
          createdAt: '2026-10-19T10:00:00Z',
        },
        {
          id: 'future-2',
          reportDate: tomorrow,
          scheduledSourceDate: tomorrow,
          colorId: sample.colors[0].id,
          operationId: sample.operations[1].operationId,
          unitsExecuted: 10,
          shiftRemainingToNextDay: false,
          createdAt: '2026-10-19T10:00:00Z',
        },
      ],
    };

    // 1. In schedule with referenceDate = today:
    // Future execution logs are transferred to today (the execution date)
    const schedule = buildProductionSchedule(
      [orderWithFutureLogs],
      DEFAULT_WORKSHOP_CONFIG,
      { referenceDate: today }
    );

    // On today: the 2 advance blocks are placed and marked as executed advances
    const todayPlan = schedule.days.find((d) => d.date === today);
    expect(todayPlan).toBeDefined();
    const todayAdvanceBlocks = todayPlan!.blocks.filter((b) => b.isExecutedReport);
    expect(todayAdvanceBlocks.length).toBe(2);

    // On tomorrow: tomorrow has NO executed reports, starts clean at 07:00
    const tomorrowPlan = schedule.days.find((d) => d.date === tomorrow);
    expect(tomorrowPlan).toBeDefined();
    expect(tomorrowPlan!.blocks.length).toBeGreaterThan(0);
    expect(tomorrowPlan!.blocks[0].startClock).toBe('07:00');
    expect(tomorrowPlan!.blocks.some((b) => b.isExecutedReport)).toBe(false);

    // 2. cleanAdvancedWorkFromOrders / transferAdvancedWorkToExecutionDate:
    // Transfers logs to today without deleting them
    const transferred = cleanAdvancedWorkFromOrders([orderWithFutureLogs], today);
    expect(transferred[0].executionLogs).toHaveLength(2);
    expect(transferred[0].executionLogs![0].reportDate).toBe(today);
    expect(transferred[0].executionLogs![0].scheduledSourceDate).toBe(tomorrow);
    expect(transferred[0].executionLogs![1].reportDate).toBe(today);
    expect(transferred[0].executionLogs![1].scheduledSourceDate).toBe(tomorrow);
  });
});
