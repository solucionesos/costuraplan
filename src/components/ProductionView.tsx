import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Calendar,
  Shirt,
  Palette,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  X,
  Check,
  GripVertical,
  RefreshCw,
  Zap,
  CalendarClock,
} from 'lucide-react';
import {
  ColorBatch,
  DeliveryMode,
  ProductionOperationItem,
  ProductionOrder,
  SewingOperation,
  WorkshopConfig,
} from '../domain/types';
import { COLOR_PALETTE } from '../domain/defaults';
import {
  addDaysIso,
  buildProductionSchedule,
  evaluateProductionSummary,
  formatDurationHuman,
  reorderProductionOperations,
} from '../domain/scheduler';
import { getTodayIso } from '../storage';

interface ProductionViewProps {
  productions: ProductionOrder[];
  scheduledProductions: ProductionOrder[];
  operationsCatalog: SewingOperation[];
  workshopConfig: WorkshopConfig;
  hasUnrecalculatedChanges: boolean;
  onSaveProductions: (orders: ProductionOrder[]) => void;
  onRecalculateSchedule: () => void;
  onOpenCalendarForProduction: (productionId: string) => void;
}

export const ProductionView: React.FC<ProductionViewProps> = ({
  productions,
  scheduledProductions,
  operationsCatalog,
  workshopConfig,
  hasUnrecalculatedChanges,
  onSaveProductions,
  onRecalculateSchedule,
  onOpenCalendarForProduction,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(null);

  // Form states
  const [garmentName, setGarmentName] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [receivedDate, setReceivedDate] = useState(getTodayIso());
  const [deliveryDate, setDeliveryDate] = useState(addDaysIso(getTodayIso(), 5));
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('asap');
  const [colors, setColors] = useState<ColorBatch[]>([]);
  const [selectedOps, setSelectedOps] = useState<ProductionOperationItem[]>([]);

  // Drag & Drop state for Production Cards in main list
  const [draggedCardOp, setDraggedCardOp] = useState<{
    orderId: string;
    index: number;
  } | null>(null);
  const [dragOverCardOp, setDragOverCardOp] = useState<{
    orderId: string;
    index: number;
  } | null>(null);

  // Drag & Drop state inside the Create/Edit modal
  const [draggedModalOpIdx, setDraggedModalOpIdx] = useState<number | null>(
    null
  );
  const [dragOverModalOpIdx, setDragOverModalOpIdx] = useState<number | null>(
    null
  );

  // Color sub-form
  const [newColorName, setNewColorName] = useState('Blanco');
  const [newColorHex, setNewColorHex] = useState('#F8FAFC');
  const [newColorUnits, setNewColorUnits] = useState('50');

  // Operation selector sub-form
  const [selectedCatalogOpId, setSelectedCatalogOpId] = useState(
    operationsCatalog[0]?.id ?? ''
  );

  const openNewOrderForm = () => {
    const today = getTodayIso();
    setEditingOrder(null);
    setGarmentName('');
    setReferenceCode(`LOTE-${productions.length + 101}`);
    setReceivedDate(today);
    setDeliveryDate(addDaysIso(today, 5));
    setDeliveryMode('asap');
    setColors([
      { id: `col-${Date.now()}-1`, colorName: 'Blanco', colorHex: '#F8FAFC', units: 60 },
      { id: `col-${Date.now()}-2`, colorName: 'Negro', colorHex: '#1E293B', units: 60 },
    ]);
    setSelectedOps(
      operationsCatalog.slice(0, 4).map((op) => ({
        operationId: op.id,
        operationName: op.name,
        machine: op.machine,
        minutesPerUnit: op.standardMinutes,
      }))
    );
    setSelectedCatalogOpId(operationsCatalog[0]?.id ?? '');
    setIsFormOpen(true);
  };

  const openEditOrderForm = (order: ProductionOrder) => {
    setEditingOrder(order);
    setGarmentName(order.garmentName);
    setReferenceCode(order.referenceCode);
    setReceivedDate(order.receivedDate);
    setDeliveryDate(order.deliveryDate);
    setDeliveryMode(order.deliveryMode ?? 'asap');
    setColors([...order.colors]);
    setSelectedOps([...order.operations]);
    setSelectedCatalogOpId(operationsCatalog[0]?.id ?? '');
    setIsFormOpen(true);
  };

  const handleAddColor = () => {
    const unitsNum = parseInt(newColorUnits, 10);
    if (!newColorName.trim() || isNaN(unitsNum) || unitsNum <= 0) return;
    setColors([
      ...colors,
      {
        id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        colorName: newColorName.trim(),
        colorHex: newColorHex,
        units: unitsNum,
      },
    ]);
    setNewColorUnits('50');
  };

  const moveColor = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= colors.length) return;
    const copy = [...colors];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    setColors(copy);
  };

  const moveModalOp = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= selectedOps.length ||
      toIndex >= selectedOps.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const copy = [...selectedOps];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, moved);
    setSelectedOps(copy);
  };

  // Reorder operations directly on the card WITHOUT asking modal (triggers yellow warning banner)
  const handleReorderCardOperation = (
    order: ProductionOrder,
    fromIndex: number,
    toIndex: number
  ) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= order.operations.length ||
      toIndex >= order.operations.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const reorderedOrder = reorderProductionOperations(order, fromIndex, toIndex);
    const nextOrders = productions.map((p) =>
      p.id === order.id ? reorderedOrder : p
    );
    onSaveProductions(nextOrders);
  };

  // Change delivery mode directly on the card WITHOUT asking modal (triggers yellow warning banner)
  const handleChangeCardDeliveryMode = (
    order: ProductionOrder,
    nextMode: DeliveryMode
  ) => {
    const currentMode = order.deliveryMode ?? 'asap';
    if (currentMode === nextMode) return;
    const nextOrders = productions.map((p) =>
      p.id === order.id ? { ...p, deliveryMode: nextMode } : p
    );
    onSaveProductions(nextOrders);
  };

  const handleAddOperationFromCatalog = () => {
    const found = operationsCatalog.find((o) => o.id === selectedCatalogOpId);
    if (!found) return;
    if (selectedOps.some((o) => o.operationId === found.id)) return;
    setSelectedOps([
      ...selectedOps,
      {
        operationId: found.id,
        operationName: found.name,
        machine: found.machine,
        minutesPerUnit: found.standardMinutes,
      },
    ]);
  };

  const handleAddAllCatalogOps = () => {
    setSelectedOps(
      operationsCatalog.map((op) => ({
        operationId: op.id,
        operationName: op.name,
        machine: op.machine,
        minutesPerUnit: op.standardMinutes,
      }))
    );
  };

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!garmentName.trim() || colors.length === 0 || selectedOps.length === 0) {
      return;
    }
    const safeDelivery = deliveryDate < receivedDate ? receivedDate : deliveryDate;

    if (editingOrder) {
      const updated = productions.map((p) =>
        p.id === editingOrder.id
          ? {
              ...p,
              garmentName: garmentName.trim(),
              referenceCode: referenceCode.trim() || 'SIN-REF',
              receivedDate,
              deliveryDate: safeDelivery,
              deliveryMode,
              colors,
              operations: selectedOps,
            }
          : p
      );
      onSaveProductions(updated);
    } else {
      const newOrder: ProductionOrder = {
        id: `prod-${Date.now()}`,
        garmentName: garmentName.trim(),
        referenceCode: referenceCode.trim() || 'SIN-REF',
        receivedDate,
        deliveryDate: safeDelivery,
        deliveryMode,
        colors,
        operations: selectedOps,
        completedTaskKeys: [],
        createdAt: getTodayIso(),
      };
      onSaveProductions([newOrder, ...productions]);
    }
    setIsFormOpen(false);
  };

  const handleDeleteOrder = (id: string) => {
    onSaveProductions(productions.filter((p) => p.id !== id));
  };

  const scheduleResult = buildProductionSchedule(
    scheduledProductions,
    workshopConfig,
    {
      mode: 'standard',
    }
  );

  // Live preview inside modal
  const draftSummary = isFormOpen
    ? evaluateProductionSummary(
        {
          id: 'draft',
          garmentName: garmentName || 'Prenda',
          referenceCode,
          receivedDate,
          deliveryDate: deliveryDate < receivedDate ? receivedDate : deliveryDate,
          deliveryMode,
          colors,
          operations: selectedOps,
          completedTaskKeys: [],
          createdAt: receivedDate,
        },
        workshopConfig
      )
    : null;

  return (
    <div className="space-y-4 pb-24 w-full max-w-full overflow-x-hidden">
      {/* Header Banner (#51344D + #E17726) - Mobile Responsive Stack */}
      <div className="bg-gradient-to-r from-[#51344D] to-[#3B2538] border-b-4 border-[#E17726] rounded-2xl p-4 text-white shadow-md space-y-3">
        <div>
          <h2 className="text-lg font-bold leading-snug">
            Registro de Producciones
          </h2>
          <p className="text-xs text-stone-200 mt-0.5 leading-relaxed">
            Arrastra las operaciones para cambiar su prioridad y configura el modo de entrega.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onRecalculateSchedule}
            className={`flex items-center justify-center gap-1.5 font-bold px-3 py-2.5 rounded-xl text-xs border active:scale-95 transition ${
              hasUnrecalculatedChanges
                ? 'bg-amber-400 text-[#2e1f14] border-amber-300 shadow-sm animate-pulse'
                : 'bg-white/15 hover:bg-white/25 text-white border-white/20'
            }`}
          >
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>Recalcular</span>
          </button>

          <button
            type="button"
            onClick={openNewOrderForm}
            className="flex items-center justify-center gap-1.5 bg-[#E17726] hover:bg-[#c86419] text-white font-bold px-3 py-2.5 rounded-xl text-xs shadow-sm active:scale-95 transition"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Nueva Orden</span>
          </button>
        </div>
      </div>

      {/* Productions List */}
      <div className="space-y-4">
        {productions.map((order) => {
          const summary =
            scheduleResult.summaries[order.id] ??
            evaluateProductionSummary(order, workshopConfig);
          const currentDeliveryMode: DeliveryMode =
            order.deliveryMode ?? 'asap';

          return (
            <div
              key={order.id}
              className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200 shadow-xs space-y-3.5 w-full overflow-hidden"
            >
              {/* Top title & actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-[#FDF2E9] text-[#E17726] border border-[#E17726]/30 rounded-md text-[11px] font-bold">
                      {order.referenceCode}
                    </span>
                    <span className="text-xs text-stone-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#51344D] shrink-0" />
                      <span>
                        {order.receivedDate} → <strong>{order.deliveryDate}</strong>
                      </span>
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-[#2e1f14] mt-1.5 flex items-start gap-1.5 break-words">
                    <Shirt className="w-4 h-4 text-[#E17726] shrink-0 mt-0.5" />
                    <span className="break-words">{order.garmentName}</span>
                  </h3>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={onRecalculateSchedule}
                    className="p-2 text-[#51344D] hover:bg-[#F4EEF3] rounded-lg transition"
                    title="Recalcular programación"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditOrderForm(order)}
                    className="p-2 text-stone-500 hover:text-[#E17726] hover:bg-[#FDF2E9] rounded-lg transition"
                    title="Editar producción"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteOrder(order.id)}
                    className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    title="Eliminar producción"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Delivery Mode Selector on Card */}
              <div className="bg-[#f5f2f0] p-2.5 rounded-xl border border-stone-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                  <span className="font-bold text-[#51344D]">
                    Modo de Programación de Entrega:
                  </span>
                  <span className="text-stone-600">
                    Sale aprox:{' '}
                    <strong>
                      {summary.estimatedCompletionDate ?? order.deliveryDate}
                    </strong>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleChangeCardDeliveryMode(order, 'asap')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      currentDeliveryMode === 'asap'
                        ? 'bg-[#E17726] text-white border-[#E17726] shadow-xs'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-[#E17726]'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    <span>Apenas esté lista (100% día)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleChangeCardDeliveryMode(order, 'by-deadline')
                    }
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      currentDeliveryMode === 'by-deadline'
                        ? 'bg-[#51344D] text-white border-[#51344D] shadow-xs'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-[#51344D]'
                    }`}
                  >
                    <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                    <span>Fecha de Entrega (Todo el plazo)</span>
                  </button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-1.5 bg-stone-50 p-2.5 rounded-xl border border-stone-100 text-center">
                <div>
                  <span className="text-[10px] sm:text-[11px] text-stone-500 block">
                    Unidades
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-[#2e1f14]">
                    {summary.totalUnits} uds
                  </span>
                </div>
                <div>
                  <span className="text-[10px] sm:text-[11px] text-stone-500 block">
                    Tiempo/Prenda
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-[#51344D]">
                    {summary.minutesPerUnit} min
                  </span>
                </div>
                <div>
                  <span className="text-[10px] sm:text-[11px] text-stone-500 block">
                    Tiempo Total
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-[#2e1f14]">
                    {formatDurationHuman(summary.totalRequiredMinutes)}
                  </span>
                </div>
              </div>

              {/* Color Evacuation Order */}
              <div>
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1.5">
                  <span className="font-semibold flex items-center gap-1 text-[#2e1f14]">
                    <Palette className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
                    <span>
                      Orden de Evacuación por Color ({order.colors.length} colores):
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {order.colors.map((col, idx) => {
                    const colorMinutes = Math.round(
                      col.units * summary.minutesPerUnit
                    );
                    const finishDate = summary.colorCompletionDates[col.id];
                    return (
                      <div
                        key={col.id}
                        className="flex items-center gap-2 bg-[#f5f2f0] border border-stone-200 px-2.5 py-1.5 rounded-xl text-xs"
                      >
                        <span className="text-[10px] font-bold text-stone-400">
                          #{idx + 1}
                        </span>
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-stone-300 shrink-0"
                          style={{ backgroundColor: col.colorHex }}
                        />
                        <div>
                          <span className="font-bold text-[#2e1f14]">
                            {col.colorName}
                          </span>{' '}
                          <span className="text-stone-600">({col.units} uds)</span>
                          <span className="block text-[10px] text-stone-500">
                            {formatDurationHuman(colorMinutes)}
                            {finishDate ? ` • Sale: ${finishDate}` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Drag & Drop Operations List on Production Card (Full name on top, controls below) */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#2e1f14] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#51344D] shrink-0" />
                  <span>
                    Orden de Operaciones ({order.operations.length}) — Arrastra para cambiar prioridad:
                  </span>
                </span>

                <div className="space-y-2">
                  {order.operations.map((op, i) => {
                    const isBeingDragged =
                      draggedCardOp?.orderId === order.id &&
                      draggedCardOp?.index === i;
                    const isDragTarget =
                      dragOverCardOp?.orderId === order.id &&
                      dragOverCardOp?.index === i;

                    return (
                      <div
                        key={`${op.operationId}-${i}`}
                        draggable
                        onDragStart={() =>
                          setDraggedCardOp({ orderId: order.id, index: i })
                        }
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (
                            dragOverCardOp?.orderId !== order.id ||
                            dragOverCardOp?.index !== i
                          ) {
                            setDragOverCardOp({ orderId: order.id, index: i });
                          }
                        }}
                        onDragLeave={() => {
                          if (
                            dragOverCardOp?.orderId === order.id &&
                            dragOverCardOp?.index === i
                          ) {
                            setDragOverCardOp(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (
                            draggedCardOp &&
                            draggedCardOp.orderId === order.id &&
                            draggedCardOp.index !== i
                          ) {
                            handleReorderCardOperation(
                              order,
                              draggedCardOp.index,
                              i
                            );
                          }
                          setDraggedCardOp(null);
                          setDragOverCardOp(null);
                        }}
                        onDragEnd={() => {
                          setDraggedCardOp(null);
                          setDragOverCardOp(null);
                        }}
                        className={`p-2.5 rounded-xl border text-xs cursor-grab active:cursor-grabbing select-none touch-pan-y transition space-y-1.5 ${
                          isBeingDragged
                            ? 'opacity-40 bg-stone-100 border-stone-300'
                            : isDragTarget
                            ? 'bg-[#FDF2E9] border-[#E17726] border-2'
                            : 'bg-stone-50 hover:bg-[#FDF2E9]/40 border-stone-200'
                        }`}
                      >
                        {/* Top Row: Full Operation Name (Never Truncated) */}
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                          <span className="w-5 h-5 rounded-md bg-[#51344D] text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="font-bold text-sm text-[#2e1f14] break-words leading-snug flex-1">
                            {op.operationName}
                          </span>
                        </div>

                        {/* Bottom Row: Machine, Time & Priority Arrows */}
                        <div className="flex items-center justify-between pl-6 pt-1 border-t border-stone-200/60">
                          <span className="text-[11px] text-stone-600 bg-white px-2 py-0.5 rounded-md border border-stone-200 font-medium">
                            {op.machine} • <strong>{op.minutesPerUnit} min</strong> ({Math.round(op.minutesPerUnit * 60)} seg)
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={i === 0}
                              onClick={() =>
                                handleReorderCardOperation(order, i, i - 1)
                              }
                              className="p-1.5 bg-white border border-stone-200 text-stone-600 hover:text-[#2e1f14] disabled:opacity-30 rounded-lg"
                              title="Subir prioridad"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={i === order.operations.length - 1}
                              onClick={() =>
                                handleReorderCardOperation(order, i, i + 1)
                              }
                              className="p-1.5 bg-white border border-stone-200 text-stone-600 hover:text-[#2e1f14] disabled:opacity-30 rounded-lg"
                              title="Bajar prioridad"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Feasibility Status & Jump to Calendar */}
              <div className="pt-2 border-t border-stone-100 space-y-2.5">
                {currentDeliveryMode === 'by-deadline' ? (
                  <div className="flex items-start gap-2 text-xs text-[#51344D] bg-[#F4EEF3] p-2.5 rounded-xl border border-[#51344D]/25">
                    <CalendarClock className="w-4 h-4 shrink-0 text-[#E17726] mt-0.5" />
                    <span>
                      Programado para trabajar todos los días del plazo (
                      <strong>
                        ~{formatDurationHuman(summary.requiredDailyMinutesToMeetDeadline)}/día
                      </strong>{' '}
                      durante {summary.workingDaysBeforeDeadline} días hábiles).
                    </span>
                  </div>
                ) : summary.isFeasibleOnSchedule ? (
                  <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                    <span>
                      Apenas esté lista: usa el 100% de cada día y termina el{' '}
                      <strong>
                        {summary.estimatedCompletionDate ?? order.deliveryDate}
                      </strong>
                      .
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      Faltan <strong>{formatDurationHuman(summary.deficitMinutes)}</strong> en horario normal. Se requieren{' '}
                      <strong>
                        {formatDurationHuman(summary.requiredDailyMinutesToMeetDeadline)}/día
                      </strong>{' '}
                      para cumplir el {order.deliveryDate}.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onRecalculateSchedule}
                    className="flex items-center justify-center gap-1.5 bg-[#51344D] hover:bg-[#3B2538] text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-xs active:scale-95 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Recalcular</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenCalendarForProduction(order.id)}
                    className="flex items-center justify-center gap-1 bg-[#E17726] hover:bg-[#c86419] text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-xs active:scale-95 transition"
                  >
                    <span>Ver Calendario</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {productions.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-stone-300">
            <p className="text-sm text-stone-600 font-medium">
              No hay producciones registradas todavía.
            </p>
            <button
              onClick={openNewOrderForm}
              className="mt-3 inline-flex items-center gap-1.5 bg-[#E17726] text-white text-xs font-bold px-4 py-2.5 rounded-xl"
            >
              <Plus className="w-4 h-4" />
              Registrar Primera Producción
            </button>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Producción (Mobile-First Fixed Header/Footer + No Horizontal Overflow) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
            {/* Fixed Modal Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-stone-200 bg-white shrink-0">
              <h3 className="font-bold text-[#2e1f14] text-base">
                {editingOrder ? 'Editar Producción' : 'Registrar Nueva Producción'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <form
              onSubmit={handleSaveOrder}
              className="flex-1 min-h-0 overflow-y-auto touch-pan-y p-4 space-y-4"
            >
              {/* Prenda & Referencia */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#2e1f14] mb-1">
                    Nombre de la Prenda *
                  </label>
                  <input
                    type="text"
                    required
                    value={garmentName}
                    onChange={(e) => setGarmentName(e.target.value)}
                    placeholder="Ej. Camiseta Polo, Blusa Dama, Sudadera..."
                    className="w-full min-w-0 px-3.5 py-2 border border-stone-300 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2e1f14] mb-1">
                    Referencia / Lote
                  </label>
                  <input
                    type="text"
                    value={referenceCode}
                    onChange={(e) => setReferenceCode(e.target.value)}
                    placeholder="Ej. REF-205"
                    className="w-full min-w-0 px-3.5 py-2 border border-stone-300 rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Fechas Recepción y Entrega */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2e1f14] mb-1">
                    Fecha de Recepción *
                  </label>
                  <input
                    type="date"
                    required
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    className="w-full min-w-0 px-3 py-2 border border-stone-300 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2e1f14] mb-1">
                    Fecha de Entrega (Plazo) *
                  </label>
                  <input
                    type="date"
                    required
                    min={receivedDate}
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full min-w-0 px-3 py-2 border border-stone-300 rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Configuración de Modo de Entrega (2 Opciones) */}
              <div className="bg-[#f5f2f0] p-3 rounded-2xl border border-stone-200 space-y-2.5">
                <label className="block text-xs font-bold text-[#2e1f14]">
                  Opción de Entrega y Distribución del Tiempo *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('asap')}
                    className={`text-left p-3 rounded-xl border-2 transition flex flex-col justify-between ${
                      deliveryMode === 'asap'
                        ? 'bg-[#FDF2E9] border-[#E17726] shadow-xs'
                        : 'bg-white border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-[#2e1f14]">
                      <Zap
                        className={`w-4 h-4 shrink-0 ${
                          deliveryMode === 'asap'
                            ? 'text-[#E17726]'
                            : 'text-stone-400'
                        }`}
                      />
                      <span>Apenas esté lista</span>
                    </div>
                    <p className="text-[11px] text-stone-600 mt-1 leading-snug">
                      Utiliza el <strong>100% del tiempo disponible</strong> en cada día para entregar lo más pronto posible.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryMode('by-deadline')}
                    className={`text-left p-3 rounded-xl border-2 transition flex flex-col justify-between ${
                      deliveryMode === 'by-deadline'
                        ? 'bg-[#F4EEF3] border-[#51344D] shadow-xs'
                        : 'bg-white border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-[#2e1f14]">
                      <CalendarClock
                        className={`w-4 h-4 shrink-0 ${
                          deliveryMode === 'by-deadline'
                            ? 'text-[#51344D]'
                            : 'text-stone-400'
                        }`}
                      />
                      <span>Fecha de Entrega</span>
                    </div>
                    <p className="text-[11px] text-stone-600 mt-1 leading-snug">
                      Programa para hacer operaciones <strong>todos los días del plazo</strong> así se trabaje menos horas del horario configurado.
                    </p>
                  </button>
                </div>
              </div>

              {/* Sección Colores y Unidades (Responsive, zero overflow on Redmi Note 9) */}
              <div className="bg-[#f5f2f0] p-3 rounded-2xl border border-stone-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <label className="text-xs font-bold text-[#2e1f14] flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-[#E17726] shrink-0" />
                    <span>Colores y Unidades</span>
                  </label>
                  <span className="text-[11px] text-stone-600">
                    Total:{' '}
                    <strong>
                      {colors.reduce((s, c) => s + c.units, 0)} unidades
                    </strong>
                  </span>
                </div>

                {/* Paleta rápida */}
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_PALETTE.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setNewColorName(preset.name);
                        setNewColorHex(preset.hex);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                        newColorName === preset.name
                          ? 'border-[#E17726] bg-[#FDF2E9] text-[#2e1f14] font-bold'
                          : 'border-stone-200 bg-white text-stone-700'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-stone-300 shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      />
                      {preset.name}
                    </button>
                  ))}
                </div>

                {/* Agregar Color (2 filas limpias en móvil para evitar desborde) */}
                <div className="space-y-2 bg-white p-2.5 rounded-xl border border-stone-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newColorHex}
                      onChange={(e) => setNewColorHex(e.target.value)}
                      className="w-9 h-9 rounded-lg border border-stone-300 cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      placeholder="Nombre del color"
                      className="flex-1 min-w-0 px-3 py-2 border border-stone-300 rounded-xl text-xs bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        type="number"
                        min="1"
                        value={newColorUnits}
                        onChange={(e) => setNewColorUnits(e.target.value)}
                        placeholder="Unidades"
                        className="w-full min-w-0 px-3 py-2 border border-stone-300 rounded-xl text-xs bg-white font-bold"
                      />
                      <span className="text-xs text-stone-500 shrink-0">uds</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddColor}
                      className="bg-[#51344D] hover:bg-[#3B2538] text-white px-4 py-2 rounded-xl text-xs font-bold shrink-0"
                    >
                      + Agregar Color
                    </button>
                  </div>
                </div>

                {/* Lista de colores agregados */}
                <div className="space-y-1.5">
                  {colors.map((c, idx) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-stone-200 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-stone-400">
                          #{idx + 1}
                        </span>
                        <span
                          className="w-4 h-4 rounded-full border border-stone-300 shrink-0"
                          style={{ backgroundColor: c.colorHex }}
                        />
                        <span className="font-bold text-[#2e1f14] break-words">
                          {c.colorName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 ml-auto">
                        <input
                          type="number"
                          min="1"
                          value={c.units}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setColors(
                              colors.map((item) =>
                                item.id === c.id ? { ...item, units: val } : item
                              )
                            );
                          }}
                          className="w-16 px-2 py-1 border border-stone-200 rounded-lg text-center font-bold"
                        />
                        <span className="text-stone-500 text-[11px]">uds</span>
                        <button
                          type="button"
                          onClick={() => moveColor(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                          title="Subir prioridad"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveColor(idx, 1)}
                          disabled={idx === colors.length - 1}
                          className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                          title="Bajar prioridad"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setColors(colors.filter((item) => item.id !== c.id))
                          }
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sección Operaciones de la Prenda (Nombre completo arriba, controles abajo) */}
              <div className="bg-[#f5f2f0] p-3 rounded-2xl border border-stone-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <label className="text-xs font-bold text-[#2e1f14] flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#51344D] shrink-0" />
                    <span>Operaciones y Prioridad (Arrastra para ordenar)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddAllCatalogOps}
                    className="text-[11px] font-bold text-[#E17726] hover:underline"
                  >
                    Cargar todas las del catálogo
                  </button>
                </div>

                {/* Selector de Operación apilado en móvil para evitar desborde */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={selectedCatalogOpId}
                    onChange={(e) => setSelectedCatalogOpId(e.target.value)}
                    className="w-full min-w-0 px-3 py-2.5 border border-stone-300 rounded-xl text-xs bg-white font-medium"
                  >
                    {operationsCatalog.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.name} ({op.machine} - {op.standardMinutes} min)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddOperationFromCatalog}
                    className="w-full sm:w-auto bg-[#51344D] hover:bg-[#3B2538] text-white px-4 py-2.5 rounded-xl text-xs font-bold shrink-0"
                  >
                    + Agregar Operación
                  </button>
                </div>

                <div className="space-y-2">
                  {selectedOps.map((op, idx) => {
                    const isDragged = draggedModalOpIdx === idx;
                    const isOver = dragOverModalOpIdx === idx;
                    return (
                      <div
                        key={`${op.operationId}-${idx}`}
                        draggable
                        onDragStart={() => setDraggedModalOpIdx(idx)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverModalOpIdx !== idx) {
                            setDragOverModalOpIdx(idx);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverModalOpIdx === idx) {
                            setDragOverModalOpIdx(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (
                            draggedModalOpIdx !== null &&
                            draggedModalOpIdx !== idx
                          ) {
                            moveModalOp(draggedModalOpIdx, idx);
                          }
                          setDraggedModalOpIdx(null);
                          setDragOverModalOpIdx(null);
                        }}
                        onDragEnd={() => {
                          setDraggedModalOpIdx(null);
                          setDragOverModalOpIdx(null);
                        }}
                        className={`bg-white p-2.5 rounded-xl border text-xs space-y-2 cursor-grab active:cursor-grabbing touch-pan-y transition ${
                          isDragged
                            ? 'opacity-40 border-stone-300'
                            : isOver
                            ? 'border-[#E17726] border-2 bg-[#FDF2E9]'
                            : 'border-stone-200'
                        }`}
                      >
                        {/* Fila 1: Nombre completo de la operación arriba sin recortar */}
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                          <span className="w-5 h-5 rounded-md bg-[#51344D] text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-sm text-[#2e1f14] break-words leading-snug flex-1">
                            {op.operationName}
                          </span>
                        </div>

                        {/* Fila 2: Máquina, tiempo editable y botones debajo */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pl-6 pt-1.5 border-t border-stone-100">
                          <span className="text-[11px] text-stone-500 font-medium">
                            {op.machine} ({Math.round(op.minutesPerUnit * 60)} seg)
                          </span>

                          <div className="flex items-center gap-1 ml-auto">
                            <input
                              type="number"
                              step="0.05"
                              min="0.05"
                              value={op.minutesPerUnit}
                              onChange={(e) => {
                                const val = Math.max(
                                  0.05,
                                  parseFloat(e.target.value) || 0.1
                                );
                                setSelectedOps(
                                  selectedOps.map((item, i) =>
                                    i === idx
                                      ? { ...item, minutesPerUnit: val }
                                      : item
                                  )
                                );
                              }}
                              className="w-16 px-2 py-1 border border-stone-200 rounded-lg text-center font-bold"
                            />
                            <span className="text-[11px] text-stone-500">min</span>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveModalOp(idx, idx - 1)}
                              className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === selectedOps.length - 1}
                              onClick={() => moveModalOp(idx, idx + 1)}
                              className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedOps(
                                  selectedOps.filter((_, i) => i !== idx)
                                )
                              }
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resumen instantáneo antes de guardar */}
              {draftSummary && (
                <div className="bg-[#FDF2E9] border border-[#E17726]/40 rounded-2xl p-3 text-xs text-[#2e1f14] space-y-1">
                  <div className="flex flex-wrap justify-between gap-1 font-bold">
                    <span>Tiempo total requerido del lote:</span>
                    <span>
                      {formatDurationHuman(draftSummary.totalRequiredMinutes)} (
                      {draftSummary.totalRequiredMinutes} min)
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-1 text-[#51344D] font-medium">
                    <span>
                      {deliveryMode === 'by-deadline'
                        ? `Meta diaria (${draftSummary.workingDaysBeforeDeadline} días hábiles):`
                        : `Tiempo disponible (${draftSummary.workingDaysBeforeDeadline} días hábiles):`}
                    </span>
                    <span className="font-bold">
                      {deliveryMode === 'by-deadline'
                        ? `${formatDurationHuman(
                            draftSummary.requiredDailyMinutesToMeetDeadline
                          )} / día`
                        : formatDurationHuman(
                            draftSummary.availableMinutesBeforeDeadline
                          )}
                    </span>
                  </div>
                </div>
              )}

              {/* Modal Footer Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#E17726] hover:bg-[#c86419] text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
                >
                  <Check className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
