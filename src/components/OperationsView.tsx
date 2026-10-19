import React, { useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Clock,
  Wrench,
  Check,
  X,
} from 'lucide-react';
import { MachineType, SewingOperation } from '../domain/types';

const MACHINE_TYPES: MachineType[] = [
  'Fileteadora',
  'Plana',
  'Collarín',
  'Presilladora',
  'Ojaladora',
  'Botonadora',
  'Manual',
  'Especial',
];

const MACHINE_BADGE_COLORS: Record<MachineType, string> = {
  Fileteadora: 'bg-blue-100 text-blue-800 border-blue-200',
  Plana: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Collarín: 'bg-purple-100 text-purple-800 border-purple-200',
  Presilladora: 'bg-amber-100 text-amber-800 border-amber-200',
  Ojaladora: 'bg-pink-100 text-pink-800 border-pink-200',
  Botonadora: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  Manual: 'bg-slate-100 text-slate-800 border-slate-200',
  Especial: 'bg-rose-100 text-rose-800 border-rose-200',
};

interface OperationsViewProps {
  operations: SewingOperation[];
  onSaveOperations: (ops: SewingOperation[]) => void;
}

export const OperationsView: React.FC<OperationsViewProps> = ({
  operations,
  onSaveOperations,
}) => {
  const [search, setSearch] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<string>('Todas');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<SewingOperation | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [machine, setMachine] = useState<MachineType>('Fileteadora');
  const [timeUnit, setTimeUnit] = useState<'minutes' | 'seconds'>('seconds');
  const [timeValue, setTimeValue] = useState<string>('30');
  const [description, setDescription] = useState('');

  const openCreateModal = () => {
    setEditingOp(null);
    setName('');
    setMachine('Fileteadora');
    setTimeUnit('seconds');
    setTimeValue('30');
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (op: SewingOperation) => {
    setEditingOp(op);
    setName(op.name);
    setMachine(op.machine);
    setTimeUnit('minutes');
    setTimeValue(String(op.standardMinutes));
    setDescription(op.description);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const numericVal = parseFloat(timeValue);
    if (!name.trim() || isNaN(numericVal) || numericVal <= 0) return;

    const standardMinutes =
      timeUnit === 'seconds'
        ? Math.round((numericVal / 60) * 1000) / 1000
        : Math.round(numericVal * 1000) / 1000;

    if (editingOp) {
      const updated = operations.map((item) =>
        item.id === editingOp.id
          ? {
              ...item,
              name: name.trim(),
              machine,
              standardMinutes,
              description: description.trim(),
            }
          : item
      );
      onSaveOperations(updated);
    } else {
      const newOp: SewingOperation = {
        id: `op-${Date.now()}`,
        name: name.trim(),
        machine,
        standardMinutes,
        description: description.trim(),
      };
      onSaveOperations([newOp, ...operations]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    onSaveOperations(operations.filter((op) => op.id !== id));
  };

  const filtered = operations.filter((op) => {
    const matchesSearch =
      op.name.toLowerCase().includes(search.toLowerCase()) ||
      op.description.toLowerCase().includes(search.toLowerCase()) ||
      op.machine.toLowerCase().includes(search.toLowerCase());
    const matchesMachine =
      selectedMachine === 'Todas' || op.machine === selectedMachine;
    return matchesSearch && matchesMachine;
  });

  return (
    <div className="space-y-4 pb-24">
      {/* Header banner (#51344D + #E17726) */}
      <div className="bg-gradient-to-r from-[#51344D] to-[#3B2538] border-b-4 border-[#E17726] rounded-2xl p-4 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Base de Datos de Operaciones</h2>
            <p className="text-xs text-stone-200 mt-0.5">
              Catálogo de tiempos estándar (SAM) por máquina y operación
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 bg-[#E17726] hover:bg-[#c86419] text-white font-bold px-3.5 py-2 rounded-xl text-sm shadow-sm active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            Nueva
          </button>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-stone-200">
          <span>Total operaciones: <strong>{operations.length}</strong></span>
          <span>•</span>
          <span>Máquinas: <strong>{MACHINE_TYPES.length} tipos</strong></span>
        </div>
      </div>

      {/* Search & Machine Filter */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar operación, costura o máquina..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {['Todas', ...MACHINE_TYPES].map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMachine(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selectedMachine === m
                  ? 'bg-[#E17726] text-white shadow-sm'
                  : 'bg-white text-stone-600 border border-stone-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Operations Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((op) => {
          const seconds = Math.round(op.standardMinutes * 60);
          const unitsPerHour =
            op.standardMinutes > 0 ? Math.round(60 / op.standardMinutes) : 0;
          return (
            <div
              key={op.id}
              className="bg-white rounded-2xl p-3.5 border border-stone-200/80 shadow-xs flex flex-col justify-between gap-2.5"
            >
              {/* Operation name at the top of the card (never truncated) */}
              <div>
                <h3 className="font-bold text-[#2e1f14] text-sm break-words leading-snug">
                  {op.name}
                </h3>
                {op.description && (
                  <p className="text-xs text-stone-500 mt-0.5 break-words">
                    {op.description}
                  </p>
                )}
              </div>

              {/* Machine badge & Edit/Delete actions below */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                    MACHINE_BADGE_COLORS[op.machine]
                  }`}
                >
                  <Wrench className="w-3 h-3 shrink-0" />
                  {op.machine}
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditModal(op)}
                    className="p-1.5 text-stone-500 hover:text-[#E17726] hover:bg-[#FDF2E9] rounded-lg transition"
                    title="Editar operación"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(op.id)}
                    className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    title="Eliminar operación"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
                <div className="flex items-center gap-1.5 text-[#51344D] font-semibold">
                  <Clock className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
                  <span>{op.standardMinutes} min</span>
                  <span className="text-stone-400 font-normal">
                    ({seconds} seg / prenda)
                  </span>
                </div>
                <span className="text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md font-medium">
                  ~{unitsPerHour} uds/hora
                </span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl p-8 text-center border border-dashed border-slate-300">
            <p className="text-sm text-slate-500">
              No se encontraron operaciones con ese filtro.
            </p>
            <button
              onClick={openCreateModal}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl"
            >
              <Plus className="w-4 h-4" />
              Agregar operación ahora
            </button>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Operación */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base">
                {editingOp ? 'Editar Operación de Costura' : 'Nueva Operación de Costura'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre de la Operación *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Cerrar costados, Pegar cuello, Hacer ojal..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Máquina / Puesto de Trabajo *
                </label>
                <select
                  value={machine}
                  onChange={(e) => setMachine(e.target.value as MachineType)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {MACHINE_TYPES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tiempo Estándar por Prenda *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0.05"
                    required
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    className="min-w-0 flex-1 px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-[#E17726] focus:outline-none"
                  />
                  <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (timeUnit === 'minutes') {
                          const val = parseFloat(timeValue) || 0;
                          setTimeValue(String(Math.round(val * 60)));
                          setTimeUnit('seconds');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        timeUnit === 'seconds'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Segundos
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (timeUnit === 'seconds') {
                          const val = parseFloat(timeValue) || 0;
                          setTimeValue(String(Math.round((val / 60) * 100) / 100));
                          setTimeUnit('minutes');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        timeUnit === 'minutes'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Minutos
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Equivale a{' '}
                  <strong>
                    {timeUnit === 'seconds'
                      ? `${Math.round(((parseFloat(timeValue) || 0) / 60) * 100) / 100} minutos`
                      : `${Math.round((parseFloat(timeValue) || 0) * 60)} segundos`}
                  </strong>{' '}
                  por cada unidad.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descripción o Notas de Calidad (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej. Puntada de seguridad, guía de 1/4, aguja punta de bola..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
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
