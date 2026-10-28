import React, { useEffect, useState } from 'react';
import {
  Calendar,
  ClipboardList,
  Clock,
  Scissors,
  Smartphone,
  Mail,
  MessageCircle,
  Download,
  CheckCircle2,
} from 'lucide-react';
import {
  getTodayIso,
  loadOperations,
  loadProductions,
  loadWorkshopConfig,
  saveOperations,
  saveProductions,
  saveWorkshopConfig,
} from './storage';
import {
  ProductionOrder,
  SewingOperation,
  WorkshopConfig,
} from './domain/types';
import {
  applyExecutionReportToOrder,
  cleanAdvancedWorkFromOrders,
  removeExecutionLog,
} from './domain/scheduler';
import { OperationsView } from './components/OperationsView';
import { ScheduleConfigView } from './components/ScheduleConfigView';
import { ProductionView } from './components/ProductionView';
import { CalendarPlanView } from './components/CalendarPlanView';
import { MobileExportModal } from './components/MobileExportModal';
import type { BeforeInstallPromptEvent } from './main';

type ActiveTab = 'calendar' | 'productions' | 'operations' | 'schedule';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar');
  const [operations, setOperations] = useState<SewingOperation[]>(() =>
    loadOperations()
  );
  const [workshopConfig, setWorkshopConfig] = useState<WorkshopConfig>(() =>
    loadWorkshopConfig()
  );
  const [productions, setProductions] = useState<ProductionOrder[]>(() =>
    loadProductions()
  );

  // Brief non-intrusive toast when schedule is automatically recalculated
  const [autoRecalcNotice, setAutoRecalcNotice] = useState<string | null>(null);

  const [selectedProductionId, setSelectedProductionId] = useState<
    string | 'ALL'
  >('ALL');
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);

  // Native PWA install prompt state
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(
      () =>
        (typeof window !== 'undefined' && window.__deferredPwaPrompt) || null
    );

  useEffect(() => {
    const syncPrompt = () => {
      setInstallPrompt(window.__deferredPwaPrompt ?? null);
    };
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__deferredPwaPrompt = promptEvent;
      setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => {
      window.__deferredPwaPrompt = null;
      setInstallPrompt(null);
    };

    window.addEventListener('pwa-prompt-available', syncPrompt);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('pwa-prompt-available', syncPrompt);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const triggerAutoRecalcFeedback = (message: string) => {
    setAutoRecalcNotice(message);
    window.setTimeout(() => {
      setAutoRecalcNotice((prev) => (prev === message ? null : prev));
    }, 2400);
  };

  const handleTriggerInstall = async () => {
    if (!installPrompt) {
      setIsMobileModalOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      window.__deferredPwaPrompt = null;
      setInstallPrompt(null);
    }
  };

  const handleSaveOperations = (nextOps: SewingOperation[]) => {
    setOperations(nextOps);
    saveOperations(nextOps);

    // Sync updated catalog operation names/machines to existing orders automatically
    const opMap = new Map(nextOps.map((o) => [o.id, o]));
    const syncedOrders = productions.map((order) => ({
      ...order,
      operations: order.operations.map((item) => {
        const cat = opMap.get(item.operationId);
        if (!cat) return item;
        return {
          ...item,
          operationName: cat.name,
          machine: cat.machine,
        };
      }),
    }));
    setProductions(syncedOrders);
    saveProductions(syncedOrders);
    triggerAutoRecalcFeedback(
      'Catálogo y programación actualizados automáticamente'
    );
  };

  const handleSaveWorkshop = (nextConfig: WorkshopConfig) => {
    setWorkshopConfig(nextConfig);
    saveWorkshopConfig(nextConfig);
    triggerAutoRecalcFeedback('Programación recalculada automáticamente con el nuevo horario');
  };

  const handleSaveProductions = (nextOrders: ProductionOrder[]) => {
    setProductions(nextOrders);
    saveProductions(nextOrders);
    triggerAutoRecalcFeedback('Programación actualizada automáticamente');
  };

  const handleToggleTaskComplete = (productionId: string, taskKey: string) => {
    const updated = productions.map((order) => {
      if (order.id !== productionId) return order;
      const exists = order.completedTaskKeys.includes(taskKey);
      const nextKeys = exists
        ? order.completedTaskKeys.filter((k) => k !== taskKey)
        : [...order.completedTaskKeys, taskKey];
      return { ...order, completedTaskKeys: nextKeys };
    });
    setProductions(updated);
    saveProductions(updated);
  };

  const handleSubmitExecutionReport = (
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
  ) => {
    const updated = productions.map((order) =>
      order.id === productionId
        ? applyExecutionReportToOrder(order, params)
        : order
    );
    handleSaveProductions(updated);
  };

  const handleRemoveExecutionLog = (productionId: string, logId: string) => {
    const updated = productions.map((order) =>
      order.id === productionId ? removeExecutionLog(order, logId) : order
    );
    handleSaveProductions(updated);
  };

  const handleRecalculateSchedule = () => {
    // Recalcular la programación completa incluyendo el día actual y descartando cualquier trabajo adelantado
    const today = getTodayIso();
    const cleanedOrders = cleanAdvancedWorkFromOrders(productions, today);
    setProductions(cleanedOrders);
    saveProductions(cleanedOrders);
    triggerAutoRecalcFeedback(
      'Programación recalculada desde hoy: labores adelantadas reiniciadas y días programados limpios'
    );
  };

  return (
    <div className="min-h-screen w-full max-w-2xl mx-auto bg-[#f5f2f0] text-[#2e1f14] flex flex-col border-x border-stone-300/80 shadow-sm">
      {/* Top Corporate App Bar (#51344D Soluciones Open Source) */}
      <header className="sticky top-0 z-30 bg-[#51344D] text-white border-b-2 border-[#E17726] px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-sm shrink-0">
            <img
              src="/isotipo-sos.png"
              alt="Soluciones Open Source"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-white text-sm sm:text-base leading-tight tracking-tight truncate">
                CosturaPlan
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-[#E17726] text-white px-1.5 py-0.5 rounded-full shrink-0">
                SOS
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-stone-200 font-medium truncate">
              Soluciones Open Source • Gestión Textil
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {installPrompt && (
            <button
              type="button"
              onClick={handleTriggerInstall}
              className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-2 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition"
              title="Instalar aplicación en el celular"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Instalar</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsMobileModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-[#E17726] hover:bg-[#c86419] text-white px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition shrink-0"
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>App / Datos</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-3 sm:p-4 space-y-4">
        {/* Non-intrusive Auto-Recalculation Confirmation Pill */}
        {autoRecalcNotice && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl px-3.5 py-2 shadow-2xs flex items-center gap-2 text-xs font-bold animate-in fade-in duration-150"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{autoRecalcNotice}</span>
          </div>
        )}

        {activeTab === 'calendar' && (
          <CalendarPlanView
            productions={productions}
            workshopConfig={workshopConfig}
            selectedProductionId={selectedProductionId}
            onSelectProductionId={setSelectedProductionId}
            onToggleTaskComplete={handleToggleTaskComplete}
            onSubmitExecutionReport={handleSubmitExecutionReport}
            onRemoveExecutionLog={handleRemoveExecutionLog}
            onRecalculateSchedule={handleRecalculateSchedule}
          />
        )}

        {activeTab === 'productions' && (
          <ProductionView
            productions={productions}
            operationsCatalog={operations}
            workshopConfig={workshopConfig}
            onSaveProductions={handleSaveProductions}
            onOpenCalendarForProduction={(prodId) => {
              setSelectedProductionId(prodId);
              setActiveTab('calendar');
            }}
          />
        )}

        {activeTab === 'operations' && (
          <OperationsView
            operations={operations}
            onSaveOperations={handleSaveOperations}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleConfigView
            config={workshopConfig}
            onSaveConfig={handleSaveWorkshop}
          />
        )}

        {/* Corporate Footer Banner (Soluciones Open Source) */}
        <footer className="mb-20 bg-[#51344D] text-white rounded-2xl p-3.5 sm:p-4 border-t-4 border-[#E17726] shadow-md space-y-3">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl p-2 w-24 sm:w-28 h-11 sm:h-12 flex items-center justify-center shrink-0 shadow-xs">
              <img
                src="/logotipo-sos.png"
                alt="Logotipo Soluciones Open Source"
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-[#E17726] uppercase tracking-wider">
                Soluciones Open Source
              </h4>
              <p className="text-[11px] text-stone-200 leading-snug mt-0.5">
                Herramientas para impulsar, crecer controladamente y volver fácil y ágil la administración de su negocio.
              </p>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-200">
            <a
              href="https://wa.me/573053162229"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-white hover:text-[#E17726] font-semibold transition"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
              <span>WhatsApp: +57 305 316 2229</span>
            </a>
            <a
              href="mailto:luis.varon@solucionesos.com"
              className="inline-flex items-center gap-1.5 text-white hover:text-[#E17726] font-semibold transition"
            >
              <Mail className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
              <span>luis.varon@solucionesos.com</span>
            </a>
          </div>
        </footer>
      </main>

      {/* Bottom Mobile Navigation Bar (#51344D with #E17726 active state) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#51344D] text-white border-t-2 border-[#E17726] safe-bottom shadow-lg">
        <div className="max-w-2xl mx-auto grid grid-cols-4 px-1.5 sm:px-2 py-1.5">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              activeTab === 'calendar'
                ? 'bg-[#E17726] text-white font-bold shadow-xs'
                : 'text-stone-300 font-medium hover:text-white'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[11px] mt-0.5">Calendario</span>
          </button>

          <button
            onClick={() => setActiveTab('productions')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              activeTab === 'productions'
                ? 'bg-[#E17726] text-white font-bold shadow-xs'
                : 'text-stone-300 font-medium hover:text-white'
            }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-[11px] mt-0.5">Producción</span>
          </button>

          <button
            onClick={() => setActiveTab('operations')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              activeTab === 'operations'
                ? 'bg-[#E17726] text-white font-bold shadow-xs'
                : 'text-stone-300 font-medium hover:text-white'
            }`}
          >
            <Scissors className="w-5 h-5" />
            <span className="text-[11px] mt-0.5">Operaciones</span>
          </button>

          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              activeTab === 'schedule'
                ? 'bg-[#E17726] text-white font-bold shadow-xs'
                : 'text-stone-300 font-medium hover:text-white'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[11px] mt-0.5">Horario</span>
          </button>
        </div>
      </nav>

      {/* Mobile & Backup Modal */}
      <MobileExportModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
        operations={operations}
        workshopConfig={workshopConfig}
        productions={productions}
        installPrompt={installPrompt}
        onTriggerInstall={handleTriggerInstall}
        onImportAll={(data) => {
          handleSaveOperations(data.operations);
          handleSaveWorkshop(data.workshopConfig);
          handleSaveProductions(data.productions);
        }}
      />
    </div>
  );
};
