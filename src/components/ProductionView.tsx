import React, { useMemo, useState } from 'react';
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
  Zap,
  CalendarClock,
  ArrowUpWideNarrow,
  ArrowDownWideNarrow,
  Ruler,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ColorBatch,
  DeliveryMode,
  ProductionOperationItem,
  ProductionOrder,
  SewingOperation,
  SizeBatch,
  SizeSortOrder,
  WorkshopConfig,
} from '../domain/types';
import { COLOR_PALETTE, SIZE_CATALOG } from '../domain/defaults';
import {
  addDaysIso,
  buildProductionSchedule,
  evaluateProductionSummary,
  formatDurationHuman,
  getColorTotalUnits,
  getOrderedColorSizes,
  reorderProductionOperations,
} from '../domain/scheduler';
import { getTodayIso } from '../storage';

interface ProductionViewProps {
  productions: ProductionOrder[];
  operationsCatalog: SewingOperation[];
  workshopConfig: WorkshopConfig;
  onSaveProductions: (orders: ProductionOrder[]) => void;
  onOpenCalendarForProduction: (productionId: string) => void;
}

const QUICK_SIZES = [
  'Única',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '6',
  '8',
  '10',
  '12',
  '14',
  '16',
];

export const ProductionView: React.FC<ProductionViewProps> = ({
  productions,
  operationsCatalog,
  workshopConfig,
  onSaveProductions,
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
  const [sizeSortOrder, setSizeSortOrder] = useState<SizeSortOrder>('asc');
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

  // Color + Size sub-form inside modal
  const [newColorName, setNewColorName] = useState('Blanco');
  const [newColorHex, setNewColorHex] = useState('#F8FAFC');
  const [newColorSize, setNewColorSize] = useState('Única');
  const [newColorUnits, setNewColorUnits] = useState('50');

  // Inline per-color size adder state (colorId -> { size, units })
  const [inlineSizeDrafts, setInlineSizeDrafts] = useState<
    Record<string, { size: string; units: string }>
  >({});

  // Collapsible operations list per production card & delete confirmation guard
  const [expandedCardOps, setExpandedCardOps] = useState<
    Record<string, boolean>
  >({});
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<
    string | null
  >(null);

  // Operation selector sub-form
  const [selectedCatalogOpId, setSelectedCatalogOpId] = useState(
    operationsCatalog[0]?.id ?? ''
  );

  const normalizeColorWithSizes = (c: ColorBatch): ColorBatch => {
    const rawSizes: SizeBatch[] =
      c.sizes && c.sizes.length > 0
        ? c.sizes.map((s) => ({ size: s.size, units: Math.max(1, s.units) }))
        : [{ size: 'Única', units: Math.max(1, c.units) }];
    const totalUnits = rawSizes.reduce((acc, s) => acc + s.units, 0);
    return {
      ...c,
      units: totalUnits,
      sizes: rawSizes,
    };
  };

  const openNewOrderForm = () => {
    const today = getTodayIso();
    setEditingOrder(null);
    setGarmentName('');
    setReferenceCode(`LOTE-${productions.length + 101}`);
    setReceivedDate(today);
    setDeliveryDate(addDaysIso(today, 5));
    setDeliveryMode('asap');
    setSizeSortOrder('asc');
    setColors([
      {
        id: `col-${Date.now()}-1`,
        colorName: 'Blanco',
        colorHex: '#F8FAFC',
        units: 60,
        sizes: [
          { size: 'S', units: 20 },
          { size: 'M', units: 20 },
          { size: 'L', units: 20 },
        ],
      },
      {
        id: `col-${Date.now()}-2`,
        colorName: 'Negro',
        colorHex: '#1E293B',
        units: 60,
        sizes: [{ size: 'Única', units: 60 }],
      },
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
    setInlineSizeDrafts({});
    setIsFormOpen(true);
  };

  const openEditOrderForm = (order: ProductionOrder) => {
    setEditingOrder(order);
    setGarmentName(order.garmentName);
    setReferenceCode(order.referenceCode);
    setReceivedDate(order.receivedDate);
    setDeliveryDate(order.deliveryDate);
    setDeliveryMode(order.deliveryMode ?? 'asap');
    setSizeSortOrder(order.sizeSortOrder ?? 'asc');
    setColors(order.colors.map(normalizeColorWithSizes));
    setSelectedOps([...order.operations]);
    setSelectedCatalogOpId(operationsCatalog[0]?.id ?? '');
    setInlineSizeDrafts({});
    setIsFormOpen(true);
  };

  // Add a color (or if a color with the same name already exists in the draft, add/sum the size inside that color!)
  const handleAddColorOrSize = () => {
    const unitsNum = parseInt(newColorUnits, 10);
    const trimmedColor = newColorName.trim();
    const trimmedSize = newColorSize.trim() || 'Única';
    if (!trimmedColor || isNaN(unitsNum) || unitsNum <= 0) return;

    const existingColorIdx = colors.findIndex(
      (c) => c.colorName.toLowerCase() === trimmedColor.toLowerCase()
    );

    if (existingColorIdx >= 0) {
      const targetColor = normalizeColorWithSizes(colors[existingColorIdx]);
      const currentSizes = [...(targetColor.sizes ?? [])];
      const existingSizeIdx = currentSizes.findIndex(
        (s) => s.size.toUpperCase() === trimmedSize.toUpperCase()
      );
      if (existingSizeIdx >= 0) {
        currentSizes[existingSizeIdx] = {
          ...currentSizes[existingSizeIdx],
          units: currentSizes[existingSizeIdx].units + unitsNum,
        };
      } else {
        currentSizes.push({ size: trimmedSize, units: unitsNum });
      }
      const nextTotal = currentSizes.reduce((acc, s) => acc + s.units, 0);
      const nextColors = [...colors];
      nextColors[existingColorIdx] = {
        ...targetColor,
        colorHex: newColorHex,
        units: nextTotal,
        sizes: currentSizes,
      };
      setColors(nextColors);
    } else {
      setColors([
        ...colors,
        {
          id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          colorName: trimmedColor,
          colorHex: newColorHex,
          units: unitsNum,
          sizes: [{ size: trimmedSize, units: unitsNum }],
        },
      ]);
    }
    setNewColorUnits('30');
  };

  const handleAddSizeToExistingColor = (colorId: string) => {
    const draft = inlineSizeDrafts[colorId] ?? { size: 'M', units: '20' };
    const sizeStr = draft.size.trim() || 'Única';
    const unitsNum = parseInt(draft.units, 10);
    if (isNaN(unitsNum) || unitsNum <= 0) return;

    setColors(
      colors.map((c) => {
        if (c.id !== colorId) return c;
        const norm = normalizeColorWithSizes(c);
        const list = [...(norm.sizes ?? [])];
        const existingIdx = list.findIndex(
          (s) => s.size.toUpperCase() === sizeStr.toUpperCase()
        );
        if (existingIdx >= 0) {
          list[existingIdx] = {
            ...list[existingIdx],
            units: list[existingIdx].units + unitsNum,
          };
        } else {
          list.push({ size: sizeStr, units: unitsNum });
        }
        const total = list.reduce((acc, s) => acc + s.units, 0);
        return { ...norm, units: total, sizes: list };
      })
    );
  };

  const handleAddStandardCurveToColor = (colorId: string, unitsPerSize = 20) => {
    const standardSizes = ['S', 'M', 'L', 'XL'];
    setColors(
      colors.map((c) => {
        if (c.id !== colorId) return c;
        const norm = normalizeColorWithSizes(c);
        const list = [...(norm.sizes ?? [])].filter(
          (s) => s.size.toLowerCase() !== 'única' && s.size.toLowerCase() !== 'unica'
        );
        for (const stdSize of standardSizes) {
          if (!list.some((s) => s.size.toUpperCase() === stdSize)) {
            list.push({ size: stdSize, units: unitsPerSize });
          }
        }
        const total = list.reduce((acc, s) => acc + s.units, 0);
        return { ...norm, units: total, sizes: list };
      })
    );
  };

  const handleUpdateSizeUnits = (
    colorId: string,
    sizeName: string,
    nextUnits: number
  ) => {
    const safeUnits = Math.max(1, nextUnits || 1);
    setColors(
      colors.map((c) => {
        if (c.id !== colorId) return c;
        const norm = normalizeColorWithSizes(c);
        const list = (norm.sizes ?? []).map((s) =>
          s.size === sizeName ? { ...s, units: safeUnits } : s
        );
        const total = list.reduce((acc, s) => acc + s.units, 0);
        return { ...norm, units: total, sizes: list };
      })
    );
  };

  const handleRemoveSizeFromColor = (colorId: string, sizeName: string) => {
    setColors(
      colors
        .map((c) => {
          if (c.id !== colorId) return c;
          const norm = normalizeColorWithSizes(c);
          const list = (norm.sizes ?? []).filter((s) => s.size !== sizeName);
          const total = list.reduce((acc, s) => acc + s.units, 0);
          return { ...norm, units: total, sizes: list };
        })
        .filter((c) => (c.sizes?.length ?? 0) > 0 && c.units > 0)
    );
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

  // Reorder operations directly on the card -> automatically recalculates schedule
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

  // Change delivery mode directly on the card -> automatically recalculates schedule
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

  // Change size sort order ('asc' | 'desc') directly on the card -> automatically recalculates schedule
  const handleChangeCardSizeSortOrder = (
    order: ProductionOrder,
    nextSortOrder: SizeSortOrder
  ) => {
    const currentSort = order.sizeSortOrder ?? 'asc';
    if (currentSort === nextSortOrder) return;
    const nextOrders = productions.map((p) =>
      p.id === order.id ? { ...p, sizeSortOrder: nextSortOrder } : p
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
        operationName: opNameFromCatalog(found),
        machine: found.machine,
        minutesPerUnit: found.standardMinutes,
      },
    ]);
  };

  const opNameFromCatalog = (op: SewingOperation) => op.name;

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
    const normalizedColors = colors.map((c) => {
      const ordered = getOrderedColorSizes(c, sizeSortOrder);
      const total = ordered.reduce((acc, s) => acc + s.units, 0);
      return {
        ...c,
        units: total,
        sizes: ordered,
      };
    });

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
              sizeSortOrder,
              colors: normalizedColors,
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
        sizeSortOrder,
        colors: normalizedColors,
        operations: selectedOps,
        completedTaskKeys: [],
        executionLogs: [],
        createdAt: getTodayIso(),
      };
      onSaveProductions([newOrder, ...productions]);
    }
    setIsFormOpen(false);
  };

  const handleDeleteOrder = (id: string) => {
    onSaveProductions(productions.filter((p) => p.id !== id));
  };

  // Automatic real-time schedule computed from live productions & workshopConfig
  const schedule = useMemo(
    () => buildProductionSchedule(productions, workshopConfig, { mode: 'standard' }),
    [productions, workshopConfig]
  );

  // Preview summary for the modal draft
  const draftSummary = isFormOpen
    ? evaluateProductionSummary(
        {
          id: 'draft',
          garmentName: garmentName || 'Borrador',
          referenceCode,
          receivedDate,
          deliveryDate: deliveryDate < receivedDate ? receivedDate : deliveryDate,
          deliveryMode,
          sizeSortOrder,
          colors,
          operations: selectedOps,
          completedTaskKeys: [],
          createdAt: receivedDate,
        },
        workshopConfig
      )
    : null;

  return (
    <div className="space-y-4 pb-24">
      {/* Header Banner (#51344D Soluciones Open Source + #E17726) */}
      <div className="bg-gradient-to-r from-[#51344D] to-[#3B2538] border-b-4 border-[#E17726] rounded-2xl p-3.5 sm:p-4 text-white shadow-md flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold">
            Registro de Producciones
          </h2>
          <p className="text-xs text-stone-200 mt-0.5 leading-snug">
            Configura prenda, colores, tallas (Ascendente/Descendente), prioridad de operaciones y modo de entrega con recálculo automático.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewOrderForm}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-[#E17726] hover:bg-[#c86419] text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-sm active:scale-95 transition shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>+ Nueva Orden</span>
        </button>
      </div>

      {/* Production Orders List */}
      <div className="space-y-3.5">
        {productions.map((order) => {
          const summary =
            schedule.summaries[order.id] ??
            evaluateProductionSummary(order, workshopConfig);
          const currentDeliveryMode = order.deliveryMode ?? 'asap';
          const currentSizeSortOrder = order.sizeSortOrder ?? 'asc';
          const isOpsExpanded = Boolean(expandedCardOps[order.id]);

          // Compute overall execution progress for this production order
          const opMinMap = new Map(
            order.operations.map((o) => [o.operationId, o.minutesPerUnit])
          );
          const executedMinutes = (order.executionLogs ?? []).reduce(
            (sum, log) =>
              sum + log.unitsExecuted * (opMinMap.get(log.operationId) ?? 0),
            0
          );
          const progressPct =
            summary.totalRequiredMinutes > 0
              ? Math.min(
                  100,
                  Math.round(
                    (executedMinutes / summary.totalRequiredMinutes) * 100
                  )
                )
              : 0;

          return (
            <div
              key={order.id}
              className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200 shadow-xs space-y-3"
            >
              {/* Top Row: Garment Title & Actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-[#F4EEF3] text-[#51344D] font-bold text-[11px]">
                      {order.referenceCode}
                    </span>
                    <span className="text-[11px] text-stone-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {order.receivedDate} →{' '}
                      <strong className="text-[#2e1f14]">
                        {order.deliveryDate}
                      </strong>
                    </span>
                  </div>
                  <h3 className="font-bold text-[#2e1f14] text-base mt-1 flex items-start gap-1.5 break-words">
                    <Shirt className="w-4 h-4 text-[#E17726] shrink-0 mt-1" />
                    <span className="break-words">{order.garmentName}</span>
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditOrderForm(order)}
                    className="p-2 text-stone-500 hover:text-[#E17726] hover:bg-[#FDF2E9] rounded-xl transition"
                    title="Editar producción"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {confirmDeleteOrderId === order.id ? (
                    <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-2 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleDeleteOrder(order.id);
                          setConfirmDeleteOrderId(null);
                        }}
                        className="text-[11px] font-extrabold text-white bg-rose-600 hover:bg-rose-700 px-2 py-0.5 rounded-lg"
                      >
                        Sí, borrar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteOrderId(null)}
                        className="text-[11px] font-semibold text-stone-600 px-1.5 py-0.5"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOrderId(order.id)}
                      className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                      title="Eliminar producción"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Overall Production Order Progress Bar */}
              <div className="bg-[#f5f2f0] rounded-xl p-2.5 border border-stone-200/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#2e1f14]">
                    Avance General de la Orden:
                  </span>
                  <span className="font-extrabold text-emerald-700">
                    {progressPct}% completado (
                    {formatDurationHuman(Math.round(executedMinutes))} de{' '}
                    {formatDurationHuman(summary.totalRequiredMinutes)})
                  </span>
                </div>
                <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Delivery Mode & Size Sort Order Selectors on Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Delivery Mode */}
                <div className="bg-[#f5f2f0] p-2.5 rounded-xl border border-stone-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <span className="font-bold text-[#51344D]">
                      Modo de Entrega:
                    </span>
                    <span className="text-stone-600">
                      Sale:{' '}
                      <strong>
                        {summary.estimatedCompletionDate ?? order.deliveryDate}
                      </strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleChangeCardDeliveryMode(order, 'asap')}
                      className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition ${
                        currentDeliveryMode === 'asap'
                          ? 'bg-[#E17726] text-white border-[#E17726] shadow-2xs'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-[#E17726]'
                      }`}
                    >
                      <Zap className="w-3 h-3 shrink-0" />
                      <span>Apenas esté lista</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleChangeCardDeliveryMode(order, 'by-deadline')
                      }
                      className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition ${
                        currentDeliveryMode === 'by-deadline'
                          ? 'bg-[#51344D] text-white border-[#51344D] shadow-2xs'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-[#51344D]'
                      }`}
                    >
                      <CalendarClock className="w-3 h-3 shrink-0" />
                      <span>Fecha de Entrega</span>
                    </button>
                  </div>
                </div>

                {/* Size Sort Order (Ascendente / Descendente) */}
                <div className="bg-[#f5f2f0] p-2.5 rounded-xl border border-stone-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <span className="font-bold text-[#51344D] flex items-center gap-1">
                      <Ruler className="w-3.5 h-3.5 text-[#E17726]" />
                      <span>Orden de Tallaje:</span>
                    </span>
                    <span className="text-stone-500 text-[10px]">
                      Dentro de cada color
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleChangeCardSizeSortOrder(order, 'asc')}
                      className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition ${
                        currentSizeSortOrder === 'asc'
                          ? 'bg-[#E17726] text-white border-[#E17726] shadow-2xs'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-[#E17726]'
                      }`}
                    >
                      <ArrowUpWideNarrow className="w-3.5 h-3.5 shrink-0" />
                      <span>Ascendente</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleChangeCardSizeSortOrder(order, 'desc')
                      }
                      className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition ${
                        currentSizeSortOrder === 'desc'
                          ? 'bg-[#51344D] text-white border-[#51344D] shadow-2xs'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-[#51344D]'
                      }`}
                    >
                      <ArrowDownWideNarrow className="w-3.5 h-3.5 shrink-0" />
                      <span>Descendente</span>
                    </button>
                  </div>
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

              {/* Color Evacuation Order + Ordered Sizes per Color */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-stone-500">
                  <span className="font-semibold flex items-center gap-1 text-[#2e1f14]">
                    <Palette className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
                    <span>
                      Evacuación por Color y Talla ({order.colors.length}{' '}
                      {order.colors.length === 1 ? 'color' : 'colores'} • Tallaje{' '}
                      {currentSizeSortOrder === 'asc'
                        ? 'Ascendente ↑'
                        : 'Descendente ↓'}
                      ):
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {order.colors.map((col, idx) => {
                    const colTotalUnits = getColorTotalUnits(col);
                    const orderedSizes = getOrderedColorSizes(
                      col,
                      currentSizeSortOrder
                    );
                    const colorMinutes = Math.round(
                      colTotalUnits * summary.minutesPerUnit
                    );
                    const finishDate = summary.colorCompletionDates[col.id];
                    return (
                      <div
                        key={col.id}
                        className="bg-[#f5f2f0] border border-stone-200 p-2.5 rounded-xl text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-bold text-stone-400">
                              #{idx + 1}
                            </span>
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-stone-300 shrink-0"
                              style={{ backgroundColor: col.colorHex }}
                            />
                            <span className="font-bold text-[#2e1f14] truncate">
                              {col.colorName}
                            </span>
                          </div>
                          <span className="text-[11px] font-extrabold text-[#51344D] shrink-0">
                            {colTotalUnits} uds
                          </span>
                        </div>

                        {/* Ordered Sizes Pills inside Color */}
                        <div className="flex flex-wrap gap-1">
                          {orderedSizes.map((s) => (
                            <span
                              key={s.size}
                              className="inline-flex items-center gap-1 bg-white border border-stone-200 px-2 py-0.5 rounded-md text-[10px] font-semibold text-[#2e1f14]"
                            >
                              <span className="text-[#E17726] font-bold">
                                Talla {s.size}:
                              </span>
                              <span>{s.units} uds</span>
                            </span>
                          ))}
                        </div>

                        <div className="text-[10px] text-stone-500 flex items-center justify-between pt-1 border-t border-stone-200/70">
                          <span>Tiempo: {formatDurationHuman(colorMinutes)}</span>
                          {finishDate && (
                            <span className="font-bold text-emerald-700">
                              Sale: {finishDate}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Drag & Drop Operations List on Production Card (Collapsible for cleaner scanning) */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCardOps((prev) => ({
                      ...prev,
                      [order.id]: !prev[order.id],
                    }))
                  }
                  className="w-full flex items-center justify-between gap-2 bg-[#f5f2f0] hover:bg-[#FDF2E9]/70 border border-stone-200 px-3 py-2 rounded-xl text-xs font-bold text-[#2e1f14] transition"
                >
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#51344D] shrink-0" />
                    <span>
                      Orden de Operaciones ({order.operations.length}) —{' '}
                      {isOpsExpanded
                        ? 'Arrastra para cambiar prioridad'
                        : 'Toca para ver o reordenar'}
                    </span>
                  </span>
                  {isOpsExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[#E17726] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-500 shrink-0" />
                  )}
                </button>

                {!isOpsExpanded ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {order.operations.map((op, i) => (
                      <span
                        key={`${op.operationId}-${i}`}
                        className="inline-flex items-center gap-1 bg-stone-50 border border-stone-200 px-2 py-1 rounded-lg text-[11px] text-[#2e1f14]"
                      >
                        <strong className="text-[#51344D]">{i + 1}.</strong>
                        <span className="break-words">{op.operationName}</span>
                      </span>
                    ))}
                  </div>
                ) : (
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
                )}
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

                <button
                  type="button"
                  onClick={() => onOpenCalendarForProduction(order.id)}
                  className="w-full flex items-center justify-center gap-1.5 bg-[#E17726] hover:bg-[#c86419] text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-xs active:scale-95 transition"
                >
                  <span>Ver Calendario Día a Día</span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </button>
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

      {/* Modal Crear / Editar Producción */}
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

              {/* Configuración de Modo de Entrega y Orden de Tallaje */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Modo de Entrega */}
                <div className="bg-[#f5f2f0] p-3 rounded-2xl border border-stone-200 space-y-2">
                  <label className="block text-xs font-bold text-[#2e1f14]">
                    Opción de Entrega *
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryMode('asap')}
                      className={`text-left p-2.5 rounded-xl border-2 transition ${
                        deliveryMode === 'asap'
                          ? 'bg-[#FDF2E9] border-[#E17726] shadow-2xs'
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-[#2e1f14]">
                        <Zap
                          className={`w-4 h-4 shrink-0 ${
                            deliveryMode === 'asap'
                              ? 'text-[#E17726]'
                              : 'text-stone-400'
                          }`}
                        />
                        <span>Apenas esté lista (100% día)</span>
                      </div>
                      <p className="text-[10px] text-stone-600 mt-0.5 leading-snug">
                        Usa el 100% del horario diario para terminar lo antes posible.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryMode('by-deadline')}
                      className={`text-left p-2.5 rounded-xl border-2 transition ${
                        deliveryMode === 'by-deadline'
                          ? 'bg-[#F4EEF3] border-[#51344D] shadow-2xs'
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-[#2e1f14]">
                        <CalendarClock
                          className={`w-4 h-4 shrink-0 ${
                            deliveryMode === 'by-deadline'
                              ? 'text-[#51344D]'
                              : 'text-stone-400'
                          }`}
                        />
                        <span>Fecha de Entrega (Todo el plazo)</span>
                      </div>
                      <p className="text-[10px] text-stone-600 mt-0.5 leading-snug">
                        Reparte operaciones todos los días del plazo de entrega.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Parámetro Orden de Tallaje (Ascendente / Descendente) */}
                <div className="bg-[#f5f2f0] p-3 rounded-2xl border border-stone-200 space-y-2">
                  <label className="block text-xs font-bold text-[#2e1f14] flex items-center gap-1.5">
                    <Ruler className="w-4 h-4 text-[#E17726] shrink-0" />
                    <span>Orden de Tallaje (por Color) *</span>
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setSizeSortOrder('asc')}
                      className={`text-left p-2.5 rounded-xl border-2 transition ${
                        sizeSortOrder === 'asc'
                          ? 'bg-[#FDF2E9] border-[#E17726] shadow-2xs'
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-[#2e1f14]">
                        <ArrowUpWideNarrow
                          className={`w-4 h-4 shrink-0 ${
                            sizeSortOrder === 'asc'
                              ? 'text-[#E17726]'
                              : 'text-stone-400'
                          }`}
                        />
                        <span>Ascendente (Menor a Mayor)</span>
                      </div>
                      <p className="text-[10px] text-stone-600 mt-0.5 leading-snug">
                        Ej. Única, 6 → 8 → 10, XS → S → M → L → XL
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSizeSortOrder('desc')}
                      className={`text-left p-2.5 rounded-xl border-2 transition ${
                        sizeSortOrder === 'desc'
                          ? 'bg-[#F4EEF3] border-[#51344D] shadow-2xs'
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-[#2e1f14]">
                        <ArrowDownWideNarrow
                          className={`w-4 h-4 shrink-0 ${
                            sizeSortOrder === 'desc'
                              ? 'text-[#51344D]'
                              : 'text-stone-400'
                          }`}
                        />
                        <span>Descendente (Mayor a Menor)</span>
                      </div>
                      <p className="text-[10px] text-stone-600 mt-0.5 leading-snug">
                        Ej. XL → L → M → S → XS, 10 → 8 → 6, Única
                      </p>
                    </button>
                  </div>
                </div>
              </div>

              {/* Sección Colores, Tallas y Unidades */}
              <div className="bg-[#f5f2f0] p-3 rounded-2xl border border-stone-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <label className="text-xs font-bold text-[#2e1f14] flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-[#E17726] shrink-0" />
                    <span>Colores, Tallas (incluye Única) y Unidades</span>
                  </label>
                  <span className="text-[11px] text-stone-600">
                    Total lote:{' '}
                    <strong>
                      {colors.reduce((s, c) => s + getColorTotalUnits(c), 0)}{' '}
                      unidades
                    </strong>
                  </span>
                </div>

                {/* Paleta rápida de Colores */}
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

                {/* Botones rápidos de Tallas (incluyendo Única) */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-stone-600 block">
                    Selecciona Talla (incluye Talla Única):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SIZES.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setNewColorSize(sz)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                          newColorSize.toUpperCase() === sz.toUpperCase()
                            ? 'bg-[#51344D] text-white border-[#51344D] shadow-2xs'
                            : 'bg-white text-[#2e1f14] border-stone-200 hover:border-[#E17726]'
                        }`}
                      >
                        {sz === 'Única' ? 'Talla Única' : sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Formulario Agregar Color + Talla + Unidades */}
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
                      placeholder="Nombre del color (ej. Blanco)"
                      className="flex-1 min-w-0 px-3 py-2 border border-stone-300 rounded-xl text-xs bg-white font-semibold"
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-stone-500 font-semibold mb-0.5">
                        Talla
                      </label>
                      <input
                        type="text"
                        list="size-catalog-list"
                        value={newColorSize}
                        onChange={(e) => setNewColorSize(e.target.value)}
                        placeholder="Única, S, M, L..."
                        className="w-full min-w-0 px-2.5 py-2 border border-stone-300 rounded-xl text-xs bg-white font-bold"
                      />
                      <datalist id="size-catalog-list">
                        {SIZE_CATALOG.map((sz) => (
                          <option key={sz} value={sz} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[10px] text-stone-500 font-semibold mb-0.5">
                        Unidades
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newColorUnits}
                        onChange={(e) => setNewColorUnits(e.target.value)}
                        placeholder="Unidades"
                        className="w-full min-w-0 px-2.5 py-2 border border-stone-300 rounded-xl text-xs bg-white font-bold"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex items-end">
                      <button
                        type="button"
                        onClick={handleAddColorOrSize}
                        className="w-full bg-[#51344D] hover:bg-[#3B2538] text-white px-3 py-2 rounded-xl text-xs font-bold"
                      >
                        + Agregar Color / Talla
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lista de Colores y sus Tallas ordenadas según sizeSortOrder */}
                <div className="space-y-2.5">
                  {colors.map((c, idx) => {
                    const orderedSizes = getOrderedColorSizes(c, sizeSortOrder);
                    const colorTotal = getColorTotalUnits(c);
                    const draft = inlineSizeDrafts[c.id] ?? {
                      size: 'M',
                      units: '20',
                    };

                    return (
                      <div
                        key={c.id}
                        className="bg-white p-3 rounded-xl border border-stone-200 text-xs space-y-2.5"
                      >
                        {/* Cabecera del Color */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-stone-400">
                              Color #{idx + 1}
                            </span>
                            <span
                              className="w-4 h-4 rounded-full border border-stone-300 shrink-0"
                              style={{ backgroundColor: c.colorHex }}
                            />
                            <span className="font-bold text-sm text-[#2e1f14] break-words">
                              {c.colorName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#FDF2E9] text-[#E17726] font-extrabold text-[11px]">
                              {colorTotal} uds
                            </span>
                          </div>

                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              type="button"
                              onClick={() => moveColor(idx, -1)}
                              disabled={idx === 0}
                              className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                              title="Subir prioridad de color"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveColor(idx, 1)}
                              disabled={idx === colors.length - 1}
                              className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                              title="Bajar prioridad de color"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setColors(
                                  colors.filter((item) => item.id !== c.id)
                                )
                              }
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                              title="Eliminar color"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Tallas dentro de este Color (ordenadas según Ascendente o Descendente) */}
                        <div className="pl-2 border-l-2 border-[#E17726]/40 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase text-stone-500 block">
                            Tallas en orden{' '}
                            {sizeSortOrder === 'asc'
                              ? 'Ascendente (↑)'
                              : 'Descendente (↓)'}
                            :
                          </span>

                          {orderedSizes.map((s, sIdx) => (
                            <div
                              key={s.size}
                              className="flex items-center justify-between gap-2 bg-[#f5f2f0] px-2.5 py-1.5 rounded-lg"
                            >
                              <span className="font-bold text-[#2e1f14]">
                                {sIdx + 1}. Talla {s.size}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  value={s.units}
                                  onChange={(e) =>
                                    handleUpdateSizeUnits(
                                      c.id,
                                      s.size,
                                      parseInt(e.target.value, 10) || 1
                                    )
                                  }
                                  className="w-16 px-2 py-1 bg-white border border-stone-300 rounded-lg text-center font-bold"
                                />
                                <span className="text-[11px] text-stone-500">
                                  uds
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveSizeFromColor(c.id, s.size)
                                  }
                                  className="p-1 text-rose-500 hover:bg-rose-50 rounded-md"
                                  title="Quitar talla"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Agregar otra talla rápidamente dentro de este mismo color */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <select
                              value={draft.size}
                              onChange={(e) =>
                                setInlineSizeDrafts({
                                  ...inlineSizeDrafts,
                                  [c.id]: { ...draft, size: e.target.value },
                                })
                              }
                              className="min-w-0 px-2 py-1 border border-stone-300 rounded-lg text-[11px] bg-white font-semibold"
                            >
                              {SIZE_CATALOG.map((sz) => (
                                <option key={sz} value={sz}>
                                  Talla {sz}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="1"
                              value={draft.units}
                              onChange={(e) =>
                                setInlineSizeDrafts({
                                  ...inlineSizeDrafts,
                                  [c.id]: { ...draft, units: e.target.value },
                                })
                              }
                              placeholder="Uds"
                              className="w-16 px-2 py-1 border border-stone-300 rounded-lg text-[11px] bg-white font-bold text-center"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddSizeToExistingColor(c.id)}
                              className="bg-[#E17726] hover:bg-[#c86419] text-white px-2.5 py-1 rounded-lg text-[11px] font-bold"
                            >
                              + Talla a {c.colorName}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAddStandardCurveToColor(
                                  c.id,
                                  parseInt(draft.units, 10) || 20
                                )
                              }
                              className="bg-[#51344D] hover:bg-[#3B2538] text-white px-2.5 py-1 rounded-lg text-[11px] font-bold"
                              title="Agregar tallas S, M, L y XL rápidamente a este color"
                            >
                              + Curva S-M-L-XL
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                  Guardar y Programar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
