import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, Syringe, FileText, Heart, Weight,
  Thermometer, Calendar, ChevronDown, ChevronRight, X,
  Loader2, PawPrint, AlertTriangle, Pencil, Check, ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useDebounce } from '../hooks/useDebounce';
import { cn } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import toast from 'react-hot-toast';
import type { Pet, MedicalRecord, Vaccination } from '../lib/types';

const FADE = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

const SPECIES_EMOJI: Record<string, string> = {
  Dog: '🐕', dog: '🐕',
  Cat: '🐈', cat: '🐈',
  Rabbit: '🐇', rabbit: '🐇',
  Bird: '🦜', bird: '🦜',
  Ferret: '🦦',
  Horse: '🐴', Equine: '🐴',
  NAC: '🐾',
};

const GENDER_LABEL: Record<string, string> = {
  M: 'Mâle', F: 'Femelle', MN: 'Mâle castré', FS: 'Femelle stérilisée',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function VaccineTimeline({ vaccinations }: { vaccinations: Vaccination[] }) {
  const today = new Date();
  return (
    <div className="space-y-2">
      {vaccinations.length === 0 && (
        <p className="text-sm text-slate-400 italic py-2">Aucun vaccin enregistré.</p>
      )}
      {vaccinations.map((v) => {
        const due = new Date(v.nextDueDate);
        const overdue = due < today;
        const dueSoon = !overdue && due < new Date(today.getTime() + 30 * 86400_000);
        return (
          <div key={v.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
            <Syringe className={cn('w-4 h-4 mt-0.5 flex-shrink-0', overdue ? 'text-red-500' : dueSoon ? 'text-amber-500' : 'text-emerald-500')} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{v.vaccineName}</p>
              <p className="text-xs text-slate-500">{v.diseaseTarget} · Lot {v.batchNumber}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Administré le {format(new Date(v.administeredDate), 'dd/MM/yyyy')}
                {' · '}
                <span className={cn('font-medium', overdue ? 'text-red-600' : dueSoon ? 'text-amber-600' : 'text-emerald-600')}>
                  Rappel {overdue ? 'dépassé' : 'prévu'} : {format(due, 'dd/MM/yyyy')}
                </span>
              </p>
            </div>
            {overdue && <Badge variant="destructive" className="flex-shrink-0 text-[10px]">EN RETARD</Badge>}
            {!overdue && dueSoon && <Badge className="flex-shrink-0 text-[10px] bg-amber-500">BIENTÔT</Badge>}
          </div>
        );
      })}
    </div>
  );
}

function MedicalTimeline({ records }: { records: MedicalRecord[] }) {
  const [expanded, setExpanded] = useState<string | null>(records[0]?.id ?? null);
  return (
    <div className="space-y-2">
      {records.length === 0 && (
        <p className="text-sm text-slate-400 italic py-2">Aucune consultation enregistrée.</p>
      )}
      {records.map((r) => (
        <div key={r.id} className="border border-slate-100 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{r.diagnosis}</p>
              <p className="text-xs text-slate-400">{format(new Date(r.visitDate), 'dd/MM/yyyy HH:mm')}</p>
            </div>
            {r.weightAtVisit && (
              <span className="text-xs text-slate-500 font-medium">{r.weightAtVisit} kg</span>
            )}
            {expanded === r.id ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
          </button>
          <AnimatePresence>
            {expanded === r.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 pt-2 bg-slate-50 border-t border-slate-100 space-y-3">
                  {r.temperatureC && (
                    <div className="flex items-center gap-2 text-sm">
                      <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-slate-600">Température: <strong>{r.temperatureC}°C</strong></span>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Symptômes</p>
                    <p className="text-sm text-slate-700 whitespace-pre-line">{r.symptoms}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Diagnostic</p>
                    <p className="text-sm text-slate-700 whitespace-pre-line">{r.diagnosis}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Plan de traitement</p>
                    <p className="text-sm text-slate-700 whitespace-pre-line">{r.treatmentPlan}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ─── Pet Detail Panel ─────────────────────────────────────────────────────────

function PetDetailPanel({ petId, onClose, canWriteRecords }: {
  petId: string;
  onClose: () => void;
  canWriteRecords: boolean;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'info' | 'records' | 'vaccines'>('info');
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showVaxForm, setShowVaxForm] = useState(false);

  const { data: pet, isLoading } = useQuery({
    queryKey: ['pet', petId],
    queryFn: () => api.getPet(petId),
  });

  const recordMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createMedicalRecord>[1]) =>
      api.createMedicalRecord(petId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pet', petId] });
      toast.success('Consultation enregistrée');
      setShowRecordForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vaxMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createVaccination>[1]) =>
      api.createVaccination(petId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pet', petId] });
      toast.success('Vaccin enregistré');
      setShowVaxForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleRecordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    recordMutation.mutate({
      symptoms: f.get('symptoms') as string,
      diagnosis: f.get('diagnosis') as string,
      treatmentPlan: f.get('treatmentPlan') as string,
      weightAtVisit: f.get('weight') ? Number(f.get('weight')) : null,
      temperatureC: f.get('temp') ? Number(f.get('temp')) : null,
    });
  };

  const handleVaxSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    vaxMutation.mutate({
      vaccineName: f.get('vaccineName') as string,
      diseaseTarget: f.get('diseaseTarget') as string,
      batchNumber: f.get('batchNumber') as string,
      nextDueDate: f.get('nextDueDate') as string,
      administeredDate: (f.get('administeredDate') as string) || null,
    });
  };

  if (isLoading || !pet) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const overdueVaccines = (pet.vaccinations ?? []).filter(v => new Date(v.nextDueDate) < new Date());

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-2xl flex-shrink-0">
          {SPECIES_EMOJI[pet.species] ?? '🐾'}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold text-slate-900 truncate">{pet.name}</h2>
          <p className="text-sm text-slate-500">
            {pet.species}{pet.breed ? ` · ${pet.breed}` : ''}{pet.gender ? ` · ${GENDER_LABEL[pet.gender] ?? pet.gender}` : ''}
          </p>
          <p className="text-xs text-slate-400 truncate">
            Propriétaire: {pet.owner.name ?? pet.owner.phone ?? '—'}
          </p>
        </div>
        {overdueVaccines.length > 0 && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-bold text-red-600">{overdueVaccines.length} rappel{overdueVaccines.length > 1 ? 's' : ''} en retard</span>
          </div>
        )}
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick vitals */}
      <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-slate-100">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Weight className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs text-slate-400">Poids</p>
          </div>
          <p className="font-bold text-slate-800">{pet.weightKg ? `${pet.weightKg} kg` : '—'}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs text-slate-400">Naissance</p>
          </div>
          <p className="font-bold text-slate-800">
            {pet.dateOfBirth ? format(new Date(pet.dateOfBirth), 'MM/yyyy') : '—'}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <ClipboardList className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs text-slate-400">Puce</p>
          </div>
          <p className="font-bold text-slate-800 text-xs truncate">{pet.microchipNo ?? '—'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-6">
        {(['info', 'records', 'vaccines'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-3 text-sm font-semibold border-b-2 transition-colors',
              tab === t
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {t === 'info' ? 'Informations' : t === 'records' ? `Consultations (${pet.medicalRecords?.length ?? 0})` : `Vaccins (${pet.vaccinations?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === 'info' && (
          <div className="space-y-4">
            {pet.allergies && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">⚠️ Allergies</p>
                <p className="text-sm text-red-700">{pet.allergies}</p>
              </div>
            )}
            {pet.medicalNotes && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Notes médicales</p>
                <p className="text-sm text-amber-800">{pet.medicalNotes}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Tatouage', pet.tattooNo ?? '—'],
                ['Propriétaire', pet.owner.name ?? pet.owner.phone ?? '—'],
                ['Tél. propriétaire', pet.owner.phone ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className="font-semibold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
            {(pet.bookings?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Derniers RDV</p>
                <div className="space-y-1.5">
                  {pet.bookings!.slice(0, 5).map(b => (
                    <div key={b.id} className="flex items-center gap-2 text-sm">
                      <span className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        b.status === 'completed' ? 'bg-emerald-400' : b.status === 'cancelled' ? 'bg-red-400' : 'bg-amber-400'
                      )} />
                      <span className="text-slate-500 text-xs">{format(new Date(b.scheduledAt), 'dd/MM/yyyy')}</span>
                      <span className="text-slate-700 truncate">{b.service.nameEn}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'records' && (
          <div className="space-y-4">
            {canWriteRecords && !showRecordForm && (
              <Button onClick={() => setShowRecordForm(true)} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Nouvelle consultation
              </Button>
            )}
            {showRecordForm && (
              <form onSubmit={handleRecordSubmit} className="space-y-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                <p className="font-bold text-sm text-indigo-800">Nouvelle consultation</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Poids (kg)</label>
                    <input name="weight" type="number" step="0.1" min="0" placeholder="ex: 4.5"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Température (°C)</label>
                    <input name="temp" type="number" step="0.1" min="25" max="45" placeholder="ex: 38.5"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Symptômes *</label>
                  <textarea name="symptoms" required rows={2} placeholder="Décrire les symptômes présentés..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Diagnostic *</label>
                  <textarea name="diagnosis" required rows={2} placeholder="Diagnostic posé..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Plan de traitement *</label>
                  <textarea name="treatmentPlan" required rows={2} placeholder="Médicaments, posologie, suivi..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => setShowRecordForm(false)}>Annuler</Button>
                  <Button type="submit" size="sm" className="flex-1 gap-1" disabled={recordMutation.isPending}>
                    {recordMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Enregistrer
                  </Button>
                </div>
              </form>
            )}
            <MedicalTimeline records={pet.medicalRecords ?? []} />
          </div>
        )}

        {tab === 'vaccines' && (
          <div className="space-y-4">
            {canWriteRecords && !showVaxForm && (
              <Button onClick={() => setShowVaxForm(true)} className="w-full gap-2">
                <Syringe className="w-4 h-4" /> Enregistrer un vaccin
              </Button>
            )}
            {showVaxForm && (
              <form onSubmit={handleVaxSubmit} className="space-y-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <p className="font-bold text-sm text-emerald-800">Nouveau vaccin</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Nom du vaccin *</label>
                    <input name="vaccineName" required placeholder="ex: Rabisin, Eurican..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Maladie ciblée *</label>
                    <input name="diseaseTarget" required placeholder="ex: Rage, CHPPiL..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">N° de lot *</label>
                    <input name="batchNumber" required placeholder="ex: AB12345"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Date d'administration</label>
                    <input name="administeredDate" type="date"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-600 mb-1 block">Date du prochain rappel *</label>
                    <input name="nextDueDate" type="date" required
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => setShowVaxForm(false)}>Annuler</Button>
                  <Button type="submit" size="sm" className="flex-1 gap-1" disabled={vaxMutation.isPending}>
                    {vaxMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Enregistrer
                  </Button>
                </div>
              </form>
            )}
            <VaccineTimeline vaccinations={pet.vaccinations ?? []} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Register Pet Modal ───────────────────────────────────────────────────────

function RegisterPetModal({ onClose, ownerId }: { onClose: () => void; ownerId?: string }) {
  const queryClient = useQueryClient();
  const [ownerSearch, setOwnerSearch] = useState('');
  const ownerDebounced = useDebounce(ownerSearch, 300);
  const [selectedOwnerId, setSelectedOwnerId] = useState(ownerId ?? '');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-search', ownerDebounced],
    queryFn: async () => {
      const result = await api.getClients({ search: ownerDebounced, limit: 10 });
      return (result as any).clients ?? result;
    },
    enabled: !ownerId && ownerDebounced.length >= 2,
  });

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createPet>[0]) => api.createPet(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pets'] });
      toast.success('Patient enregistré avec succès');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOwnerId) { toast.error('Sélectionner un propriétaire'); return; }
    const f = new FormData(e.currentTarget);
    mutation.mutate({
      ownerId: selectedOwnerId,
      name: f.get('name') as string,
      species: f.get('species') as string,
      breed: (f.get('breed') as string) || null,
      gender: (f.get('gender') as 'M' | 'F' | 'MN' | 'FS') || null,
      dateOfBirth: (f.get('dateOfBirth') as string) || null,
      weightKg: f.get('weight') ? Number(f.get('weight')) : null,
      microchipNo: (f.get('microchip') as string) || null,
      tattooNo: (f.get('tattoo') as string) || null,
      allergies: (f.get('allergies') as string) || null,
      medicalNotes: (f.get('medicalNotes') as string) || null,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <PawPrint className="w-5 h-5 text-emerald-600" />
            <h3 className="font-extrabold text-slate-900">Enregistrer un patient</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Owner */}
          {!ownerId && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Propriétaire *</label>
              {selectedOwnerId ? (
                <div className="flex items-center gap-2 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-800 flex-1">Propriétaire sélectionné</p>
                  <button type="button" onClick={() => setSelectedOwnerId('')} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <>
                  <input
                    value={ownerSearch} onChange={e => setOwnerSearch(e.target.value)}
                    placeholder="Rechercher par nom ou téléphone..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  {Array.isArray(clients) && clients.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      {clients.slice(0, 5).map((c: any) => (
                        <button
                          key={c.id} type="button"
                          onClick={() => { setSelectedOwnerId(c.id); setOwnerSearch(c.name ?? c.phone ?? ''); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
                        >
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                            {(c.name || c.phone || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{c.name ?? 'Sans nom'}</p>
                            <p className="text-xs text-slate-400">{c.phone}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nom *</label>
              <input name="name" required placeholder="ex: Luna"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Espèce *</label>
              <select name="species" required
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white">
                <option value="">Sélectionner...</option>
                {['Dog', 'Cat', 'Rabbit', 'Bird', 'Ferret', 'Horse', 'NAC'].map(s => (
                  <option key={s} value={s}>{SPECIES_EMOJI[s]} {s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Race</label>
              <input name="breed" placeholder="ex: Berger Allemand"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sexe</label>
              <select name="gender"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white">
                <option value="">—</option>
                {Object.entries(GENDER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Date de naissance</label>
              <input name="dateOfBirth" type="date"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Poids (kg)</label>
              <input name="weight" type="number" step="0.1" min="0" placeholder="ex: 8.5"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">N° de puce (15 chiffres)</label>
              <input name="microchip" placeholder="000000000000000"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">N° de tatouage</label>
              <input name="tattoo" placeholder="ex: TN-12345"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">⚠️ Allergies connues</label>
            <input name="allergies" placeholder="ex: pénicilline, AINS..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Notes médicales initiales</label>
            <textarea name="medicalNotes" rows={3} placeholder="Antécédents, conditions chroniques..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button type="submit" className="flex-1 gap-2" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PawPrint className="w-4 h-4" />}
              Enregistrer
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PetsPage() {
  const { user, tenant } = useAuth();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const canWriteRecords = user?.role === 'doctor' || user?.role === 'super_admin';

  const { data: pets = [], isLoading } = useQuery({
    queryKey: ['pets', tenant?.id, debouncedSearch],
    queryFn: () => api.getPets({ q: debouncedSearch || undefined }),
    enabled: !!tenant,
  });

  const overdueCount = pets.filter(p =>
    (p.vaccinations ?? []).some(v => new Date(v.nextDueDate) < new Date())
  ).length;

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <motion.div {...FADE} className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-slate-900">Dossiers Patients 🐾</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pets.length} patient{pets.length !== 1 ? 's' : ''} enregistré{pets.length !== 1 ? 's' : ''}
            {overdueCount > 0 && (
              <span className="ml-2 text-red-600 font-semibold">· {overdueCount} rappel{overdueCount > 1 ? 's' : ''} en retard</span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowRegisterModal(true)} className="gap-2 flex-shrink-0">
          <Plus className="w-4 h-4" /> Nouveau patient
        </Button>
      </motion.div>

      {/* Search bar */}
      <motion.div {...FADE} className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom, puce ou téléphone du propriétaire..."
          className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 shadow-sm"
        />
      </motion.div>

      {/* Content */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Pet list */}
        <div className={cn('flex flex-col min-h-0', selectedPetId ? 'hidden lg:flex lg:w-80 xl:w-96 flex-shrink-0' : 'flex-1')}>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              </div>
            ) : pets.length === 0 ? (
              <Card className="text-center py-16">
                <CardContent>
                  <PawPrint className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="font-bold text-slate-700">
                    {search ? 'Aucun patient trouvé' : 'Aucun patient enregistré'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    {search ? 'Essayez une autre recherche.' : 'Commencez par enregistrer votre premier patient.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              pets.map(pet => {
                const hasOverdueVax = (pet.vaccinations ?? []).some(v => new Date(v.nextDueDate) < new Date());
                return (
                  <motion.button
                    key={pet.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedPetId(pet.id === selectedPetId ? null : pet.id)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left',
                      selectedPetId === pet.id
                        ? 'border-emerald-300 bg-emerald-50 shadow-md shadow-emerald-100'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
                    )}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl flex-shrink-0">
                      {SPECIES_EMOJI[pet.species] ?? '🐾'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 truncate">{pet.name}</p>
                        {hasOverdueVax && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                      </div>
                      <p className="text-sm text-slate-500 truncate">
                        {pet.species}{pet.breed ? ` · ${pet.breed}` : ''}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {pet.owner.name ?? pet.owner.phone ?? '—'}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {pet.weightKg && (
                        <p className="text-xs font-semibold text-slate-600">{pet.weightKg} kg</p>
                      )}
                      {pet.microchipNo && (
                        <p className="text-[10px] text-slate-400 font-mono">{pet.microchipNo.slice(-6)}</p>
                      )}
                    </div>
                    <ChevronRight className={cn('w-4 h-4 flex-shrink-0 transition-transform', selectedPetId === pet.id && 'rotate-90 text-emerald-600 lg:rotate-0')} />
                  </motion.button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedPetId && (
            <motion.div
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-0"
            >
              <PetDetailPanel
                petId={selectedPetId}
                onClose={() => setSelectedPetId(null)}
                canWriteRecords={canWriteRecords}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Register modal */}
      <AnimatePresence>
        {showRegisterModal && (
          <RegisterPetModal onClose={() => setShowRegisterModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
