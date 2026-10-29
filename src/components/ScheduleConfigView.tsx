import React, { useState } from 'react';
import { CalendarOff, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { DaySchedule, WorkshopConfig } from '../domain/types';
import {
  calculateDayAvailableMinutes,
  calculateWeeklyMinutes,
  formatDurationHuman,
} from '../domain/scheduler';

interface ScheduleConfigViewProps {
  config: WorkshopConfig;
  onSaveConfig: (config: WorkshopConfig) => void;
}

export const ScheduleConfigView: React.FC<ScheduleConfigViewProps> = ({
  config,
  onSaveConfig,
}) => {
  const [newHoliday, setNewHoliday] = useState('');

  const updateDay = (dayOfWeek: number, patch: Partial<DaySchedule>) => {
    const updatedDays = config.days.map((d) =>
      d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d
    );
    onSaveConfig({ ...config, days: updatedDays });
  };

  const addHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday || config.nonWorkingDates.includes(newHoliday)) return;
    const nextHolidays = [...config.nonWorkingDates, newHoliday].sort();
    onSaveConfig({ ...config, nonWorkingDates: nextHolidays });
    setNewHoliday('');
  };

  const removeHoliday = (iso: string) => {
    onSaveConfig({
      ...config,
      nonWorkingDates: config.nonWorkingDates.filter((d) => d !== iso),
    });
  };

  const weeklyMinutes = calculateWeeklyMinutes(config);
  const activeDaysCount = config.days.filter(
    (d) => calculateDayAvailableMinutes(d) > 0
  ).length;

  return (
    <div className="space-y-4 pb-24">
      {/* Summary Header (#51344D + #E17726) */}
      <div className="bg-gradient-to-r from-[#51344D] to-[#3B2538] border-b-4 border-[#E17726] rounded-2xl p-4 text-white shadow-md">
        <h2 className="text-lg font-bold">Horario y Días de Trabajo</h2>
        <p className="text-xs text-stone-200 mt-0.5">
          Configura la jornada semanal real del taller para programar el calendario
        </p>

        <div className="grid grid-cols-2 gap-2.5 mt-3.5">
          <div className="bg-white/15 backdrop-blur-xs rounded-xl p-2.5 border border-white/10">
            <span className="text-[11px] text-stone-200 block">
              Capacidad Semanal Total
            </span>
            <span className="text-base font-extrabold text-[#E17726]">
              {formatDurationHuman(weeklyMinutes)}{' '}
              <span className="text-xs font-normal text-white opacity-90">
                ({weeklyMinutes} min)
              </span>
            </span>
          </div>
          <div className="bg-white/15 backdrop-blur-xs rounded-xl p-2.5 border border-white/10">
            <span className="text-[11px] text-stone-200 block">
              Días Laborables Activos
            </span>
            <span className="text-base font-extrabold text-white">
              {activeDaysCount} días / semana
            </span>
          </div>
        </div>
      </div>

      {/* Days of the week */}
      <div className="space-y-2.5">
        {config.days.map((day) => {
          const netMinutes = calculateDayAvailableMinutes(day);
          return (
            <div
              key={day.dayOfWeek}
              className={`rounded-2xl p-3.5 border transition ${
                day.enabled
                  ? 'bg-white border-slate-200 shadow-xs'
                  : 'bg-slate-100/70 border-slate-200/60 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) =>
                      updateDay(day.dayOfWeek, { enabled: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-bold text-sm text-slate-800">
                    {day.name}
                  </span>
                </label>

                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    netMinutes > 0
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {netMinutes > 0
                    ? `${formatDurationHuman(netMinutes)} (${netMinutes} min)`
                    : 'Descanso'}
                </span>
              </div>

              {day.enabled && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-slate-100">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Hora Inicio
                    </label>
                    <input
                      type="time"
                      value={day.startTime}
                      onChange={(e) =>
                        updateDay(day.dayOfWeek, { startTime: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Hora Fin
                    </label>
                    <input
                      type="time"
                      value={day.endTime}
                      onChange={(e) =>
                        updateDay(day.dayOfWeek, { endTime: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Inicio Almuerzo
                    </label>
                    <input
                      type="time"
                      value={day.breakStartTime || '12:00'}
                      onChange={(e) =>
                        updateDay(day.dayOfWeek, {
                          breakStartTime: e.target.value || '12:00',
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Almuerzo (min)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="240"
                      step="5"
                      value={day.breakMinutes}
                      onChange={(e) =>
                        updateDay(day.dayOfWeek, {
                          breakMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Festivos / Días no laborables */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <CalendarOff className="w-4 h-4 text-rose-500" />
          <h3 className="font-bold text-sm text-slate-800">
            Festivos o Fechas No Laborables
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Agrega días festivos específicos en los que el taller estará cerrado para que el calendario salte esas fechas automáticamente.
        </p>

        <form onSubmit={addHoliday} className="flex gap-2">
          <input
            type="date"
            value={newHoliday}
            onChange={(e) => setNewHoliday(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
          />
          <button
            type="submit"
            className="bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar Festivo
          </button>
        </form>

        {config.nonWorkingDates.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {config.nonWorkingDates.map((dateIso) => (
              <span
                key={dateIso}
                className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-lg text-xs font-medium"
              >
                {dateIso}
                <button
                  type="button"
                  onClick={() => removeHoliday(dateIso)}
                  className="hover:text-rose-900"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Sin días festivos bloqueados actualmente.
          </div>
        )}
      </div>
    </div>
  );
};
