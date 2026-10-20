import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  Upload,
  X,
  CheckCircle2,
  Terminal,
  MessageCircle,
  Mail,
  Copy,
  Check,
  AlertTriangle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  ProductionOrder,
  SewingOperation,
  WorkshopConfig,
} from '../domain/types';
import type { BeforeInstallPromptEvent } from '../main';

interface MobileExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  operations: SewingOperation[];
  workshopConfig: WorkshopConfig;
  productions: ProductionOrder[];
  installPrompt: BeforeInstallPromptEvent | null;
  onTriggerInstall: () => void;
  onImportAll: (data: {
    operations: SewingOperation[];
    workshopConfig: WorkshopConfig;
    productions: ProductionOrder[];
  }) => void;
}

export const MobileExportModal: React.FC<MobileExportModalProps> = ({
  isOpen,
  onClose,
  operations,
  workshopConfig,
  productions,
  installPrompt,
  onTriggerInstall,
  onImportAll,
}) => {
  const [copiedField, setCopiedField] = useState<'origin' | 'flag' | null>(
    null
  );

  if (!isOpen) return null;

  const isSecure =
    typeof window !== 'undefined' ? window.isSecureContext : true;
  const currentOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://192.168.1.X:6000';

  const copyText = (text: string, field: 'origin' | 'flag') => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2500);
      });
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  const handleExportBackup = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      operations,
      workshopConfig,
      productions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `costuraplan-sos-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (
          Array.isArray(parsed.operations) &&
          parsed.workshopConfig &&
          Array.isArray(parsed.productions)
        ) {
          onImportAll({
            operations: parsed.operations,
            workshopConfig: parsed.workshopConfig,
            productions: parsed.productions,
          });
          onClose();
        }
      } catch {
        // Ignore invalid file
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto touch-pan-y rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logotipo-sos.png"
              alt="Soluciones Open Source"
              className="h-8 sm:h-9 w-auto object-contain shrink-0"
            />
            <div className="min-w-0">
              <h3 className="font-bold text-[#2e1f14] text-sm sm:text-base leading-tight">
                Instalar App en Celular y Datos
              </h3>
              <p className="text-[11px] text-[#51344D] font-semibold">
                Soluciones Open Source
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Direct 1-Tap Install Button if Browser Prompt is Ready */}
        {installPrompt && (
          <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>¡Instalador Nativo Listo en tu Dispositivo!</span>
            </div>
            <button
              type="button"
              onClick={onTriggerInstall}
              className="w-full py-2.5 px-4 rounded-xl bg-[#E17726] hover:bg-[#c86419] text-white font-bold text-sm shadow-sm active:scale-95 transition flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>Instalar CosturaPlan Ahora</span>
            </button>
          </div>
        )}

        {/* Local Network HTTP Notice (When testing via http://192.168.x.x:8080 on Android) */}
        {!isSecure && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 space-y-2.5 text-xs text-amber-950">
            <div className="flex items-start gap-2 font-bold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                ¿Por qué Chrome bloquea &ldquo;Instalar App&rdquo; en red local ({currentOrigin})?
              </span>
            </div>
            <p className="leading-snug text-[11px] text-amber-900">
              Por seguridad, Chrome en Android solo activa el instalador de Apps en <strong>HTTPS</strong> o <strong>localhost</strong>. Si entras por IP local (<code>{currentOrigin}</code>), habilítalo en 3 pasos en Chrome del celular:
            </p>
            <ol className="list-decimal pl-4 space-y-2 text-[11px]">
              <li>
                Copia esta dirección y pégala en una pestaña nueva de Chrome en tu celular:
                <div className="mt-1 flex items-center gap-1.5">
                  <code className="flex-1 min-w-0 bg-white border border-amber-300 px-2 py-1.5 rounded-lg text-[10px] font-mono break-all">
                    chrome://flags/#unsafely-treat-insecure-origin-as-secure
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        'chrome://flags/#unsafely-treat-insecure-origin-as-secure',
                        'flag'
                      )
                    }
                    className="bg-[#51344D] text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 inline-flex items-center gap-1"
                  >
                    {copiedField === 'flag' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Flag
                      </>
                    )}
                  </button>
                </div>
              </li>
              <li>
                En el cuadro de texto de esa opción, pega la dirección actual de tu servidor y cámbiala de <em>Disabled</em> a <strong>Enabled</strong>:
                <div className="mt-1 flex items-center gap-1.5">
                  <code className="flex-1 min-w-0 bg-white border border-amber-300 px-2 py-1.5 rounded-lg text-[10px] font-mono break-all">
                    {currentOrigin}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(currentOrigin, 'origin')}
                    className="bg-[#E17726] text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 inline-flex items-center gap-1"
                  >
                    {copiedField === 'origin' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar URL
                      </>
                    )}
                  </button>
                </div>
              </li>
              <li>
                Toca el botón azul <strong>Relaunch</strong> abajo. Al volver a esta página te saldrá el botón <strong>&ldquo;Instalar CosturaPlan Ahora&rdquo;</strong>.
              </li>
            </ol>
          </div>
        )}

        {/* Force Update Installed PWA Button */}
        <div className="bg-stone-100 border border-stone-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-[#2e1f14]">
              ¿Ya instalaste la App y quieres aplicar cambios nuevos?
            </h4>
            <p className="text-[11px] text-stone-600 mt-0.5 leading-snug">
              Descarga la última versión del servidor conservando todas tus producciones y operaciones.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.update()));
              }
              if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
              window.location.reload();
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-[#51344D] hover:bg-[#3B2538] text-white px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 shadow-xs active:scale-95 transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
            <span>Actualizar App Ahora</span>
          </button>
        </div>

        {/* Option 1: Direct PWA Install */}
        <div className="bg-[#FDF2E9] border border-[#E17726]/40 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-xs text-[#2e1f14]">
            <CheckCircle2 className="w-4 h-4 text-[#E17726] shrink-0" />
            <span>Opción 1: Instalar desde el Menú del Navegador</span>
          </div>
          <ul className="text-xs text-[#2e1f14] list-disc pl-4 space-y-1">
            <li>
              <strong>En Android (Chrome):</strong> Toca el menú <strong>⋮</strong> (arriba a la derecha) y selecciona <strong>&ldquo;Instalar aplicación&rdquo;</strong>.
            </li>
            <li>
              <strong>En iPhone (Safari):</strong> Toca el botón <strong>Compartir</strong> y selecciona <strong>&ldquo;Agregar a inicio&rdquo;</strong>.
            </li>
          </ul>
        </div>

        {/* Option 2: Native APK via Capacitor */}
        <div className="bg-[#f5f2f0] border border-stone-200 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-xs text-[#51344D]">
            <Terminal className="w-4 h-4 text-[#51344D] shrink-0" />
            <span>Opción 2: Generar APK nativo de Android con Capacitor</span>
          </div>
          <pre className="bg-[#2e1f14] text-stone-100 p-2.5 rounded-xl text-[11px] overflow-x-auto">
            {`npm run build\nnpx cap add android\nnpx cap sync android\nnpx cap open android`}
          </pre>
        </div>

        {/* Backup & Restore */}
        <div className="border-t border-stone-200 pt-3 space-y-2">
          <h4 className="text-xs font-bold text-[#2e1f14]">
            Copia de Seguridad (Exportar / Importar Base de Datos)
          </h4>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleExportBackup}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#E17726] hover:bg-[#c86419] text-white text-xs font-bold active:scale-95 transition shadow-xs"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Exportar Datos</span>
            </button>

            <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#51344D] hover:bg-[#3B2538] text-white text-xs font-bold cursor-pointer text-center transition shadow-xs">
              <Upload className="w-4 h-4 shrink-0" />
              <span>Importar Datos</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Official Contact Info */}
        <div className="bg-[#51344D] text-white rounded-2xl p-3.5 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-[#E17726]">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>Soporte y Mesa de Ayuda — Soluciones Open Source</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
              +57 305 316 2229
            </span>
            <span className="inline-flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-[#E17726] shrink-0" />
              luis.varon@solucionesos.com
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
