import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  CheckSquare,
  Square,
  Wrench,
  Layers,
  ClipboardCheck,
  FastForward,
  AlertTriangle,
  RotateCcw,
  X,
  ArrowRight,
  History,
  EyeOff,
  Ruler,
} from 'lucide-react';
import {
  ProductionOrder,
  ScheduledTaskBlock,
  WorkshopConfig,
} from '../domain/types';
import {
  buildProductionSchedule,
  formatDurationHuman,
  getColorTotalUnits,
  getOrderedColorSizes,
  validateExecutionReport,
} from '../domain/scheduler';
import { getTodayIso } from '../storage';

interface CalendarPlanViewProps {
  productions: ProductionOrder[];
  workshopConfig: WorkshopConfig;
  selectedProductionId: string | 'ALL';
  onSelectProductionId: (id: string | 'ALL') => void;
  onToggleTaskComplete: (productionId: string, taskKey: string) => void;
  onSubmitExecutionReport: (
    productionId: string,
    params: {
      reportDate: string;
      scheduledSourceDate: string;
      colorId: string;
      size?: string;
      operationId: string;
      unitsExecuted: number;
      plannedUnitsOnBlock: number;
    }
  ) => void;
  onRemoveExecutionLog: (productionId: string, logId: string) => void;
  onRecalculateSchedule: () => void;
}

export const CalendarPlanView: React.FC<CalendarPlanViewProps> = ({
  productions,
  workshopConfig,
  selectedProductionId,
  onSelectProductionId,
  onToggleTaskComplete,
  onSubmitExecutionReport,
  onRemoveExecutionLog,
  onRecalculateSchedule,
}) => {
  // Default to 'standard' or 'fit-deadline' toggle
  const [scheduleMode, setScheduleMode] = useState<'fit-deadline' | 'standard'>(
    'standard'
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showPastDays, setShowPastDays] = useState<boolean>(false);
  const todayIso = getTodayIso();

  // Modal state for reporting execution or advancing future operations
  const [reportingBlock, setReportingBlock] =
    useState<ScheduledTaskBlock | null>(null);
  const [isAdvancePickerOpen, setIsAdvancePickerOpen] = useState(false);
  const [reportDateInput, setReportDateInput] = useState<string>(todayIso);
  const [unitsExecutedInput, setUnitsExecutedInput] = useState<string>('');

  const filteredOrders = useMemo(() => {
    if (selectedProductionId === 'ALL') return productions;
    return productions.filter((p) => p.id === selectedProductionId);
  }, [productions, selectedProductionId]);

  const schedule = useMemo(
    () =>
      buildProductionSchedule(filteredOrders, workshopConfig, {
        mode: scheduleMode,
        referenceDate: todayIso,
      }),
    [filteredOrders, workshopConfig, scheduleMode, todayIso]
  );

  // Split past days (< todayIso) vs current/upcoming days (>= todayIso)
  const pastDays = useMemo(
    () => schedule.days.filter((d) => d.date < todayIso),
    [schedule.days, todayIso]
  );

  const visibleDays = useMemo(
    () =>
      showPastDays
        ? schedule.days
        : schedule.days.filter((d) => d.date >= todayIso),
    [schedule.days, showPastDays, todayIso]
  );

  const defaultSelectedDate = useMemo(() => {
    const todayInVisible = visibleDays.find((d) => d.date === todayIso);
    if (todayInVisible) return todayInVisible.date;

    const firstUpcomingWithBlocks = visibleDays.find(
      (d) => d.date >= todayIso && d.blocks.length > 0
    );
    if (firstUpcomingWithBlocks) return firstUpcomingWithBlocks.date;

    if (visibleDays.length > 0) return visibleDays[0].date;

    return null;
  }, [visibleDays, todayIso]);

  const currentSelectedDate =
    selectedDate && visibleDays.some((d) => d.date === selectedDate)
      ? selectedDate
      : defaultSelectedDate;

  const currentDayPlan = visibleDays.find(
    (d) => d.date === currentSelectedDate
  );

  // Find all future pending blocks after currentSelectedDate so user can advance them easily
  const futurePendingBlocks = useMemo(() => {
    if (!currentSelectedDate) return [];
    return schedule.days
      .filter((d) => d.date > currentSelectedDate)
      .flatMap((d) => d.blocks.filter((b) => !b.isExecutedReport));
  }, [schedule.days, currentSelectedDate]);

  const completedKeysSet = useMemo(() => {
    const set = new Set<string>();
    for (const ord of productions) {
      for (const k of ord.completedTaskKeys) {
        set.add(k);
      }
    }
    return set;
  }, [productions]);

  // Open modal for a specific block
  const openReportModalForBlock = (
    block: ScheduledTaskBlock,
    defaultReportDate?: string
  ) => {
    setReportingBlock(block);
    setReportDateInput(defaultReportDate ?? block.date);
    setUnitsExecutedInput(String(block.unitsAssigned));
    setIsAdvancePickerOpen(false);
  };

  // Validate current form inputs
  const currentValidation = useMemo(() => {
    if (!reportingBlock) return null;
    const order = productions.find((p) => p.id === reportingBlock.productionId);
    if (!order) return null;
    const rawUnits = parseFloat(unitsExecutedInput);
    const numericUnits = isNaN(rawUnits) ? NaN : Math.ceil(rawUnits);
    return validateExecutionReport(order, {
      reportDate: reportDateInput,
      scheduledSourceDate: reportingBlock.date,
      colorId: reportingBlock.colorId,
      size: reportingBlock.size,
      operationId: reportingBlock.operationId,
      unitsExecuted: numericUnits,
      plannedUnitsOnBlock: reportingBlock.unitsAssigned,
    });
  }, [reportingBlock, productions, reportDateInput, unitsExecutedInput]);

  const handleSaveReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingBlock || !currentValidation || !currentValidation.valid) {
      return;
    }
    const numericUnits = Math.ceil(parseFloat(unitsExecutedInput));
    onSubmitExecutionReport(reportingBlock.productionId, {
      reportDate: reportDateInput,
      scheduledSourceDate: reportingBlock.date,
      colorId: reportingBlock.colorId,
      size: reportingBlock.size,
      operationId: reportingBlock.operationId,
      unitsExecuted: numericUnits,
      plannedUnitsOnBlock: reportingBlock.unitsAssigned,
    });
    if (reportDateInput < todayIso) {
      setShowPastDays(true);
    }
    setSelectedDate(reportDateInput);
    setReportingBlock(null);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header Banner (#51344D Soluciones Open Source + #E17726) */}
      <div className="bg-gradient-to-r from-[#51344D] via-[#5d3c59] to-[#3B2538] border-b-4 border-[#E17726] rounded-2xl p-3.5 sm:p-4 text-white shadow-md space-y-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-[#E17726] shrink-0" />
            <span>Calendario Día a Día (Por Color y Talla)</span>
          </h2>
          <p className="text-xs text-stone-200 mt-0.5 leading-snug">
            Evacuación por color y orden de tallaje con recálculo automático en tiempo real.
          </p>
        </div>

        {/* Filter by Production & Mode Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={selectedProductionId}
            onChange={(e) => onSelectProductionId(e.target.value)}
            className="w-full min-w-0 px-3 py-2 rounded-xl bg-white text-[#2e1f14] text-xs font-semibold focus:outline-none"
          >
            <option value="ALL">
              Todas las Producciones ({productions.length})
            </option>
            {productions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.referenceCode} - {p.garmentName} (Entrega: {p.deliveryDate})
              </option>
            ))}
          </select>

          <div className="flex bg-black/25 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setScheduleMode('standard')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition ${
                scheduleMode === 'standard'
                  ? 'bg-[#E17726] text-white shadow-xs'
                  : 'text-stone-200 hover:text-white'
              }`}
            >
              Según Orden (Lista / Plazo)
            </button>
            <button
              type="button"
              onClick={() => setScheduleMode('fit-deadline')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition ${
                scheduleMode === 'fit-deadline'
                  ? 'bg-[#E17726] text-white shadow-xs'
                  : 'text-stone-200 hover:text-white'
              }`}
            >
              Forzar Todo el Plazo
            </button>
          </div>
        </div>

        {/* Recalcular Button */}
        <div className="pt-0.5">
          <button
            type="button"
            onClick={onRecalculateSchedule}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#E17726] hover:bg-[#c86419] text-white py-2 px-3.5 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition"
            title="Recalcular la programación completa incluyendo el día actual y reiniciando cualquier labor adelantada"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Recalcular Programación (Incluyendo Hoy • Sin Adelantos)</span>
          </button>
        </div>
      </div>

      {/* Color & Size Evacuation Roadmap Cards */}
      {filteredOrders.length > 0 && (
        <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#2e1f14] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#E17726] shrink-0" />
              <span>Ruta de Evacuación por Color y Talla</span>
            </h3>
            <span className="text-[11px] text-stone-500 shrink-0">
              1 color a la vez • Ordenado por talla
            </span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {filteredOrders.flatMap((order) => {
              const sortOrd = order.sizeSortOrder ?? 'asc';
              return order.colors.map((col, idx) => {
                const finishDate =
                  schedule.summaries[order.id]?.colorCompletionDates[col.id];
                const orderedSizes = getOrderedColorSizes(col, sortOrd);
                const colTotal = getColorTotalUnits(col);
                return (
                  <button
                    key={`${order.id}-${col.id}`}
                    onClick={() => {
                      if (finishDate) {
                        if (finishDate < todayIso) {
                          setShowPastDays(true);
                        }
                        setSelectedDate(finishDate);
                      }
                    }}
                    className="min-w-[185px] text-left bg-[#f5f2f0] hover:bg-[#FDF2E9] border border-stone-200 rounded-xl p-2.5 transition shrink-0 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-stone-500 font-semibold">
                      <span>
                        Color #{idx + 1} ({sortOrd === 'asc' ? '↑ Asc' : '↓ Desc'})
                      </span>
                      <span className="font-bold text-[#51344D]">
                        {colTotal} uds
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border border-stone-300 shrink-0"
                        style={{ backgroundColor: col.colorHex }}
                      />
                      <span className="font-bold text-xs text-[#2e1f14] truncate">
                        {col.colorName}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {orderedSizes.map((s) => (
                        <span
                          key={s.size}
                          className="text-[9px] font-bold bg-white border border-stone-200 px-1.5 py-0.5 rounded text-[#2e1f14]"
                        >
                          {s.size}: {s.units}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-stone-500 truncate">
                      {order.garmentName}
                    </p>
                    <div className="pt-1 border-t border-stone-200/70 flex items-center justify-between text-[10px]">
                      <span className="text-stone-500">Evacuado el:</span>
                      <span className="font-bold text-emerald-700">
                        {finishDate ?? 'Pendiente'}
                      </span>
                    </div>
                  </button>
                );
              });
            })}
          </div>
        </div>
      )}

      {/* Horizontal Day Selector Strip */}
      {schedule.days.length > 0 ? (
        <>
          {/* Past Days Toggle Bar & Jump to Today */}
          {(pastDays.length > 0 ||
            schedule.days.some((d) => d.date === todayIso)) && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-stone-200 shadow-2xs">
              <div className="flex items-center gap-2 text-xs text-stone-600">
                <CalendarIcon className="w-4 h-4 text-[#E17726] shrink-0" />
                <span>
                  Día actual:{' '}
                  <strong className="text-[#2e1f14]">{todayIso}</strong>
                </span>
                {!showPastDays && pastDays.length > 0 && (
                  <span className="text-[11px] text-stone-400">
                    ({pastDays.length}{' '}
                    {pastDays.length === 1
                      ? 'día anterior oculto'
                      : 'días anteriores ocultos'}
                    )
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {schedule.days.some((d) => d.date === todayIso) &&
                  currentSelectedDate !== todayIso && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(todayIso)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FDF2E9] hover:bg-[#E17726]/20 text-[#E17726] border border-[#E17726]/30 text-xs font-bold transition"
                    >
                      Ir a Hoy
                    </button>
                  )}

                {pastDays.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !showPastDays;
                      setShowPastDays(nextVal);
                      if (!nextVal && selectedDate && selectedDate < todayIso) {
                        setSelectedDate(todayIso);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${
                      showPastDays
                        ? 'bg-[#51344D] text-white hover:bg-[#3B2538]'
                        : 'bg-stone-100 hover:bg-stone-200 text-[#2e1f14] border border-stone-300'
                    }`}
                  >
                    {showPastDays ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 shrink-0" />
                        <span>Ocultar programación anterior</span>
                      </>
                    ) : (
                      <>
                        <History className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
                        <span>
                          Mostrar programación anterior ({pastDays.length})
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {visibleDays.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1.5">
              {visibleDays.map((day) => {
                const isSelected = day.date === currentSelectedDate;
                const isToday = day.date === todayIso;
                const isPast = day.date < todayIso;
                const dayNum = day.date.split('-')[2];
                const monthNum = day.date.split('-')[1];
                const hasBlocks = day.blocks.length > 0;
                const hasLateBlock = day.blocks.some((b) => b.isAfterDeadline);
                const hasExecutedReport = day.blocks.some(
                  (b) => b.isExecutedReport
                );

                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`min-w-[78px] rounded-2xl p-2.5 border text-center transition flex flex-col items-center justify-between shrink-0 ${
                      isSelected
                        ? 'bg-[#51344D] text-white border-[#E17726] border-2 shadow-md scale-[1.02]'
                        : isToday
                        ? 'bg-[#FDF2E9] text-[#2e1f14] border-[#E17726] border-2 shadow-xs'
                        : isPast
                        ? 'bg-stone-100/90 text-stone-500 border-stone-200 hover:border-stone-400'
                        : hasBlocks
                        ? 'bg-white text-[#2e1f14] border-stone-200 hover:border-[#E17726]'
                        : 'bg-stone-100 text-stone-400 border-stone-200/60'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[10px] font-semibold uppercase ${
                          isSelected
                            ? 'text-[#E17726]'
                            : isToday
                            ? 'text-[#E17726] font-extrabold'
                            : 'text-stone-500'
                        }`}
                      >
                        {day.dayName.slice(0, 3)}
                      </span>
                      {isToday && (
                        <span className="text-[8px] font-extrabold px-1 rounded-sm uppercase bg-[#E17726] text-white">
                          Hoy
                        </span>
                      )}
                    </div>
                    <span className="text-base font-extrabold my-0.5">
                      {dayNum}/{monthNum}
                    </span>

                    {/* Color dots worked on that day */}
                    <div className="flex items-center gap-1 mt-1 h-3">
                      {Array.from(
                        new Set(day.blocks.map((b) => b.colorHex))
                      ).map((hex, i) => (
                        <span
                          key={i}
                          className="w-2.5 h-2.5 rounded-full border border-white/80 shadow-2xs"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      {!hasBlocks && (
                        <span className="text-[9px] opacity-75">Libre</span>
                      )}
                    </div>

                    {day.colorsEvacuated.length > 0 && (
                      <span
                        className={`mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                          isSelected
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        ★ {day.colorsEvacuated.length} sale
                      </span>
                    )}

                    {hasExecutedReport && (
                      <span
                        className={`mt-1 text-[9px] font-bold px-1.5 rounded-full ${
                          isSelected
                            ? 'bg-[#E17726] text-white'
                            : 'bg-[#FDF2E9] text-[#E17726]'
                        }`}
                      >
                        ✓ Reporte
                      </span>
                    )}

                    {hasLateBlock && (
                      <span className="mt-1 text-[9px] font-bold px-1.5 rounded-full bg-rose-100 text-rose-700">
                        Extra plazo
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-6 text-center border border-stone-200 space-y-3">
              <p className="text-xs text-stone-600">
                Todas las fechas de esta programación son anteriores al día actual (
                <strong>{todayIso}</strong>).
              </p>
              <button
                type="button"
                onClick={() => setShowPastDays(true)}
                className="inline-flex items-center gap-1.5 bg-[#51344D] hover:bg-[#3B2538] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition"
              >
                <History className="w-4 h-4 text-[#E17726]" />
                <span>Mostrar programación anterior ({pastDays.length} días)</span>
              </button>
            </div>
          )}

          {/* Selected Day Detailed Schedule */}
          {currentDayPlan && (
            <div className="space-y-3">
              {/* Day summary bar & Advance Future Operation Button */}
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold uppercase text-[#E17726]">
                      {currentDayPlan.dayName} • {currentDayPlan.date}
                    </span>
                    <h3 className="text-sm font-bold text-[#2e1f14] mt-0.5">
                      {currentDayPlan.blocks.length > 0
                        ? `${currentDayPlan.blocks.length} bloques de operación en este día`
                        : 'Día sin operaciones asignadas'}
                    </h3>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-xs font-semibold text-[#51344D] block">
                      Carga del día: {formatDurationHuman(currentDayPlan.usedMinutes)}
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Capacidad disp.:{' '}
                      {formatDurationHuman(currentDayPlan.capacityMinutes)}
                    </span>
                  </div>
                </div>

                {/* Action bar to advance operations from subsequent days on currentSelectedDate */}
                {futurePendingBlocks.length > 0 && (
                  <div className="pt-2.5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs text-stone-600">
                      ¿Terminaste temprano o quieres adelantar trabajo de días posteriores en{' '}
                      <strong>{currentDayPlan.date}</strong>?
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAdvancePickerOpen(true)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-[#E17726] hover:bg-[#c86419] text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs active:scale-95 transition shrink-0"
                    >
                      <FastForward className="w-3.5 h-3.5 shrink-0" />
                      <span>Adelantar Operación de Otro Día</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Colors Evacuated Banner on this day */}
              {currentDayPlan.colorsEvacuated.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      ¡Colores 100% Terminados y Listos para Evacuar este Día!
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentDayPlan.colorsEvacuated.map((ev) => (
                      <div
                        key={`${ev.productionId}-${ev.colorId}`}
                        className="inline-flex flex-wrap items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-emerald-200 text-xs shadow-2xs"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-stone-300 shrink-0"
                          style={{ backgroundColor: ev.colorHex }}
                        />
                        <span className="font-bold text-[#2e1f14]">
                          Color {ev.colorName}
                        </span>
                        <span className="text-emerald-700 font-semibold">
                          ({ev.totalUnits} uds listas)
                        </span>
                        <span className="text-stone-400">• {ev.garmentName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chronological Operation Blocks for the Selected Day */}
              <div className="space-y-2.5">
                {currentDayPlan.blocks.map((block, index) => {
                  const isDone =
                    block.isExecutedReport ||
                    completedKeysSet.has(block.taskKey);

                  return (
                    <div
                      key={block.taskKey}
                      className={`rounded-2xl p-3.5 border transition space-y-2.5 ${
                        block.isExecutedReport
                          ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
                          : isDone
                          ? 'bg-emerald-50/40 border-emerald-200 opacity-85'
                          : block.isAfterDeadline
                          ? 'bg-rose-50/40 border-rose-200'
                          : 'bg-white border-stone-200 shadow-xs'
                      }`}
                    >
                      {/* Row 1: Operation Name on top (full text, never truncated) */}
                      <div className="flex items-start gap-2.5">
                        {!block.isExecutedReport ? (
                          <button
                            type="button"
                            onClick={() =>
                              onToggleTaskComplete(
                                block.productionId,
                                block.taskKey
                              )
                            }
                            className="mt-0.5 text-[#51344D] hover:scale-110 transition shrink-0"
                            title="Marcar casilla rápida"
                          >
                            {isDone ? (
                              <CheckSquare className="w-5 h-5 text-emerald-600" />
                            ) : (
                              <Square className="w-5 h-5 text-stone-400" />
                            )}
                          </button>
                        ) : (
                          <div className="mt-0.5 w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-sm text-[#2e1f14] break-words leading-snug">
                            {index + 1}. {block.operationName}
                          </h4>
                          <p className="text-xs text-stone-500 break-words mt-0.5">
                            Prenda: <strong>{block.garmentName}</strong> (
                            {block.referenceCode})
                          </p>
                        </div>
                      </div>

                      {/* Row 2: Badges (Time, Color, Size, Machine) & Units Assigned below Operation Name */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pl-7">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-extrabold text-[#51344D] bg-[#F4EEF3] px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#E17726]" />
                            {block.startClock} - {block.endClock}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#f5f2f0] text-[#2e1f14] border border-stone-200">
                            <span
                              className="w-3 h-3 rounded-full border border-stone-400 shrink-0"
                              style={{ backgroundColor: block.colorHex }}
                            />
                            Color {block.colorName}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-[#FDF2E9] text-[#E17726] border border-[#E17726]/40">
                            <Ruler className="w-3 h-3 shrink-0" />
                            Talla {block.size}
                          </span>
                          <span className="text-[11px] text-stone-600 font-medium flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded-md">
                            <Wrench className="w-3 h-3 text-stone-500" />
                            {block.machine}
                          </span>
                          {block.isExecutedReport && (
                            <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                              Reporte Ejecutado
                            </span>
                          )}
                          {block.isAdvanceFromFuture && (
                            <span className="text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-300 px-2 py-0.5 rounded-full">
                              ⚡ Adelantado (de {block.scheduledSourceDate})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                          <span className="text-[11px] text-stone-500 font-medium">
                            {formatDurationHuman(block.minutesAssigned)}
                          </span>
                          <span
                            className={`inline-block font-extrabold text-xs px-2.5 py-1 rounded-xl ${
                              block.isExecutedReport
                                ? 'bg-emerald-700 text-white'
                                : 'bg-[#51344D] text-white'
                            }`}
                          >
                            {block.unitsAssigned} uds{' '}
                            {block.isExecutedReport ? 'hechas' : 'prog.'}
                          </span>
                        </div>
                      </div>

                      {/* Shortfall notification if this executed report shifted remaining units to next day */}
                      {block.isExecutedReport &&
                        (block.shortfallUnitsMovedNextDay ?? 0) > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 text-[11px] text-amber-900 flex items-center gap-1.5 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              Se realizaron menos de las programadas: las{' '}
                              <strong>
                                {block.shortfallUnitsMovedNextDay} uds faltantes
                              </strong>{' '}
                              se trasladaron automáticamente al día siguiente.
                            </span>
                          </div>
                        )}

                      {/* Footer with Action Buttons to Report Executed Units or Undo */}
                      <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div>
                          {block.isColorCompletedInThisBlock ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                ¡Con esta operación queda 100% evacuado el color{' '}
                                {block.colorName} ({block.totalColorUnits} uds)!
                              </span>
                            </span>
                          ) : block.isSizeCompletedInThisBlock ? (
                            <span className="text-[#51344D] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
                              <span>
                                ¡Completa el 100% de la Talla {block.size} (
                                {block.totalSizeUnits} uds) del color{' '}
                                {block.colorName}!
                              </span>
                            </span>
                          ) : block.isOperationCompletedInThisBlock ? (
                            <span className="text-stone-600">
                              Completa las {block.totalSizeUnits} uds de Talla{' '}
                              {block.size} ({block.colorName})
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium">
                              Avance parcial ({block.unitsAssigned} de{' '}
                              {block.totalSizeUnits} uds de Talla {block.size})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                          {block.isAfterDeadline && (
                            <span className="text-rose-600 font-bold flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              Fuera de plazo
                            </span>
                          )}

                          {!block.isExecutedReport ? (
                            <button
                              type="button"
                              onClick={() => openReportModalForBlock(block)}
                              className="inline-flex items-center gap-1.5 bg-[#E17726] hover:bg-[#c86419] text-white font-bold px-3 py-1.5 rounded-xl text-xs shadow-2xs active:scale-95 transition"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                              <span>Ingresar Ejecutadas / Adelantar</span>
                            </button>
                          ) : (
                            block.executionLogId && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRemoveExecutionLog(
                                    block.productionId,
                                    block.executionLogId!
                                  )
                                }
                                className="inline-flex items-center gap-1 text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg text-xs font-semibold transition"
                              >
                                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                <span>Deshacer reporte</span>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-stone-300">
          <p className="text-sm text-stone-500">
            Registra una orden de producción para visualizar el calendario día a día.
          </p>
        </div>
      )}

      {/* MODAL 1: Picker to Advance an Operation from a Future Day onto currentSelectedDate */}
      {isAdvancePickerOpen && currentSelectedDate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg max-h-[88vh] overflow-y-auto overflow-x-hidden rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FastForward className="w-5 h-5 text-[#E17726] shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-[#2e1f14] text-sm sm:text-base">
                    Adelantar Operación en {currentSelectedDate}
                  </h3>
                  <p className="text-xs text-stone-500">
                    Selecciona qué operación de un día posterior realizaste en la fecha{' '}
                    {currentSelectedDate}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAdvancePickerOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {futurePendingBlocks.map((fb) => (
                <button
                  key={fb.taskKey}
                  type="button"
                  onClick={() =>
                    openReportModalForBlock(fb, currentSelectedDate)
                  }
                  className="w-full text-left bg-[#f5f2f0] hover:bg-[#FDF2E9] border border-stone-200 hover:border-[#E17726] rounded-2xl p-3 transition flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-bold text-sm text-[#2e1f14] break-words">
                      {fb.operationName}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-bold text-white bg-[#51344D] px-2 py-0.5 rounded-md">
                        Prog. para: {fb.date}
                      </span>
                      <span className="inline-flex items-center gap-1 font-bold text-[#2e1f14]">
                        <span
                          className="w-3 h-3 rounded-full border border-stone-400 shrink-0"
                          style={{ backgroundColor: fb.colorHex }}
                        />
                        {fb.colorName}
                      </span>
                      <span className="font-bold text-[#E17726] bg-[#FDF2E9] px-1.5 py-0.5 rounded">
                        Talla {fb.size}
                      </span>
                      <span className="text-[11px] text-stone-500">
                        ({fb.machine})
                      </span>
                    </div>
                    <p className="text-xs text-stone-500">
                      {fb.garmentName} • {fb.unitsAssigned} uds programadas ese día
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#E17726] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Enter Executed Units & Report Date */}
      {reportingBlock && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-[#2e1f14] text-base">
                  Reportar Unidades Ejecutadas
                </h3>
                <p className="text-xs text-stone-500 break-words">
                  {reportingBlock.garmentName} ({reportingBlock.referenceCode})
                </p>
              </div>
              <button
                onClick={() => setReportingBlock(null)}
                className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Block Summary Card with full Operation Name on top */}
            <div className="bg-[#f5f2f0] rounded-2xl p-3 border border-stone-200 text-xs space-y-1.5">
              <div>
                <span className="text-[10px] font-bold uppercase text-stone-500 block">
                  Operación:
                </span>
                <span className="font-bold text-sm text-[#2e1f14] break-words block">
                  {reportingBlock.operationName} ({reportingBlock.machine})
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-stone-200/70">
                <span className="text-stone-500">Color y Talla:</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-[#2e1f14]">
                  <span
                    className="w-3 h-3 rounded-full border border-stone-400 shrink-0"
                    style={{ backgroundColor: reportingBlock.colorHex }}
                  />
                  {reportingBlock.colorName} • Talla {reportingBlock.size} (
                  {reportingBlock.totalSizeUnits} uds)
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-stone-500">Fecha programada original:</span>
                <span className="font-bold text-[#51344D]">
                  {reportingBlock.date} ({reportingBlock.unitsAssigned} uds)
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveReport} className="space-y-3.5">
              {/* Report Date Input (Validates Advancing from Future Day) */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <label className="text-xs font-semibold text-[#2e1f14]">
                    Fecha del Reporte (Día ejecutado) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setReportDateInput(getTodayIso())}
                    className="text-[11px] font-bold text-[#E17726] hover:underline"
                  >
                    Usar Hoy ({getTodayIso()})
                  </button>
                </div>
                <input
                  type="date"
                  required
                  value={reportDateInput}
                  onChange={(e) => setReportDateInput(e.target.value)}
                  className="w-full min-w-0 px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#E17726] focus:outline-none"
                />
                {reportDateInput < reportingBlock.date && (
                  <p className="text-[11px] text-[#51344D] font-bold mt-1 flex items-center gap-1">
                    <FastForward className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
                    <span>
                      Adelanto detectado: estás reportando el {reportDateInput} una operación programada para el {reportingBlock.date}.
                    </span>
                  </p>
                )}
              </div>

              {/* Units Executed Input */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <label className="text-xs font-semibold text-[#2e1f14]">
                    Unidades Ejecutadas *
                  </label>
                  <span className="text-[11px] text-stone-500">
                    Programadas hoy: <strong>{reportingBlock.unitsAssigned} uds</strong>
                  </span>
                </div>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max={
                    currentValidation?.maxAllowedUnits ??
                    reportingBlock.totalSizeUnits
                  }
                  required
                  value={unitsExecutedInput}
                  onChange={(e) => setUnitsExecutedInput(e.target.value)}
                  placeholder="Ej. 20"
                  className="w-full min-w-0 px-3.5 py-2.5 border border-stone-300 rounded-xl text-base font-bold text-[#2e1f14] focus:ring-2 focus:ring-[#E17726] focus:outline-none"
                />

                {/* Quick preset buttons */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setUnitsExecutedInput(
                        String(Math.ceil(reportingBlock.unitsAssigned / 2))
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-[#2e1f14] text-xs font-medium"
                  >
                    Mitad ({Math.ceil(reportingBlock.unitsAssigned / 2)} uds)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setUnitsExecutedInput(String(reportingBlock.unitsAssigned))
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#FDF2E9] hover:bg-[#E17726]/20 text-[#E17726] text-xs font-bold"
                  >
                    Programadas ({reportingBlock.unitsAssigned} uds)
                  </button>
                  {currentValidation &&
                    currentValidation.maxAllowedUnits >
                      reportingBlock.unitsAssigned && (
                      <button
                        type="button"
                        onClick={() =>
                          setUnitsExecutedInput(
                            String(currentValidation.maxAllowedUnits)
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium"
                      >
                        Toda la talla ({currentValidation.maxAllowedUnits} uds)
                      </button>
                    )}
                </div>
              </div>

              {/* Validation / Novelty Preview Box */}
              {currentValidation && !currentValidation.valid && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{currentValidation.error}</span>
                </div>
              )}

              {currentValidation && currentValidation.valid && (
                <div
                  className={`rounded-xl p-3 text-xs font-medium border flex items-start gap-2 ${
                    currentValidation.noveltyType === 'shortfall'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : currentValidation.noveltyType === 'advance'
                      ? 'bg-[#F4EEF3] border-[#51344D]/30 text-[#51344D]'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{currentValidation.summaryMessage}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportingBlock(null)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!currentValidation?.valid}
                  className="flex-1 py-2.5 rounded-xl bg-[#E17726] hover:bg-[#c86419] disabled:bg-stone-300 text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
                >
                  Guardar y Recalcular
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
