"use client";

import {
  Accessibility,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  BookHeart,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileDown,
  Gauge,
  Home,
  LogOut,
  Mail,
  Menu,
  Minus,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Search,
  Save,
  Share2,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
  Trash2,
  UserPlus,
  UsersRound,
  Wifi,
  WifiOff,
  RefreshCw,
  MessageCircle,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnualPanel } from "@/components/annual-panel";
import { HistoryPanel, type HistoryRecord } from "@/components/history-panel";
import { StudiesModal, type StudyEntry, type StudyForm } from "@/components/studies-modal";
import { TimerCard, type TimerCategory } from "@/components/timer-card";
import { clearOfflineUserCaches, clearOfflineUserData, offlineCacheGet, offlineCacheSet, offlinePendingCount, queueOfflineMutation, removeQueuedEntityChanges, syncOfflineMutations } from "@/lib/offline-store";
import { MAX_RECORD_HOURS, validateDurationFields } from "@/lib/records";
import { recordTotalMinutes, roundReportMinutes, studyIsActiveInMonth, type RoundingMode } from "@/lib/reporting";
import { daysSinceDate, studyNeedsAttention, studyScheduleLabel } from "@/lib/studies";
import { parseStoredTimer, timerElapsed } from "@/lib/timer";

type User = {
  id: number;
  name: string;
  email: string;
  goalHours: number;
  annualGoalHours: number;
  roundingMode: RoundingMode;
  role: "user" | "admin";
  canCreateTrials: boolean;
  active: boolean;
  trialExpiresAt: string | null;
  sessionExpiresAt: string | null;
  createdAt: string;
};

type RecordEntry = {
  id: number;
  date: string;
  weekday: string;
  minutes: number;
  ldcMinutes: number;
  publications: number;
  studies: number;
  studyIds: number[];
  studyNames: string[];
  notes: string;
  month: number;
  year: number;
  createdAt?: string;
  updatedAt?: string;
  offlineKey?: string;
};

type RecordFormInput = {
  date: string;
  hours: number;
  minutes: number;
  ldcHours: number;
  ldcMinutes: number;
  publications: number;
  studies: number;
  studyIds: number[];
  notes: string;
};

type RecordDraft = {
  date: string;
  hours: string;
  minutes: string;
  ldcHours: string;
  ldcMinutes: string;
  publications: string;
  studies: string;
  studyIds: number[];
  notes: string;
};

type AuthFieldErrors = Partial<Record<"name" | "email" | "password" | "confirm" | "form", string>>;

type RecordFieldErrors = Partial<Record<"date" | "hours" | "minutes" | "ldcHours" | "ldcMinutes" | "publications" | "studies", string>>;

type AdminUser = {
  id: number;
  name: string;
  email: string;
  type: "test" | "user" | "admin";
  roleManagedByEnvironment: boolean;
  active: boolean;
  trialExpired: boolean;
  trialCreatedByEmail: string | null;
  lastAccessAt: string | null;
  createdAt: string;
};

type TrialCredentials = {
  name: string;
  email: string;
  password: string;
  expiresAt: string;
};

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type ReminderPreferences = {
  enabled: boolean;
  days: 2 | 3 | 5;
};

type AccessibilityPreferences = {
  largeText: boolean;
  highContrast: boolean;
};

type ActiveView = "home" | "history" | "studies" | "reports";
type ToastMessage = {
  text: string;
  tone: "success" | "error" | "warning" | "info";
  action?: { label: string; onClick: () => void };
};

type PeriodicSyncRegistration = ServiceWorkerRegistration & {
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
    unregister: (tag: string) => Promise<void>;
  };
};

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ACCESSIBILITY_KEY = "hora-a-hora-accessibility";
const LOGOUT_PENDING_KEY = "hora-a-hora-pending-logout";
const MAX_MONTHLY_GOAL = 200;
const MAX_ANNUAL_GOAL = 2400;
const DURATION_SHORTCUTS = [
  { minutes: 15, label: "+15 min" },
  { minutes: 30, label: "+30 min" },
  { minutes: 45, label: "+45 min" },
  { minutes: 60, label: "+1 hora" },
] as const;

const THEMES = [
  { id: "blue", label: "Azul", color: "#4a6da7", description: "Clássico e equilibrado" },
  { id: "pink", label: "Rosa", color: "#b6577d", description: "Acolhedor e delicado" },
  { id: "green", label: "Verde", color: "#497b60", description: "Calmo e natural" },
  { id: "lilac", label: "Lilás", color: "#7c63ad", description: "Suave e criativo" },
  { id: "yellow", label: "Amarelo", color: "#9a6500", description: "Leve e luminoso" },
  { id: "dark", label: "Dark", color: "#28364c", description: "Confortável à noite" },
  { id: "white", label: "Branco", color: "#6b7280", description: "Limpo e minimalista" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

function isTheme(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: Record<string, unknown>) {
    super(message);
  }
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: options?.credentials ?? "same-origin",
      cache: options?.cache ?? "no-store",
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error ?? (response.status >= 500
      ? "O servidor encontrou um erro. Tente novamente em alguns instantes."
      : "Não foi possível concluir esta ação."), response.status, data);
  }
  return data as T;
}

function hoursLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${String(rest).padStart(2, "0")}min` : `${hours}h`;
}

function durationParts(totalMinutes: number) {
  return {
    hours: String(Math.floor(totalMinutes / 60)),
    minutes: String(totalMinutes % 60),
  };
}

function addDuration(hours: string, minutes: string, amount: number) {
  const current = Math.max(0, (Number(hours) || 0) * 60 + (Number(minutes) || 0));
  return durationParts(Math.min(MAX_RECORD_HOURS * 60, current + amount));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function dateTime(value: string | null) {
  if (!value) return "Nenhum acesso registrado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value)).replace(" de ", " ");
}

function accountTypeLabel(user: Pick<AdminUser, "type">) {
  if (user.type === "test") return "Teste";
  return user.type === "admin" ? "Administrador" : "Usuário";
}

function lastAccessLabel(value: string | null) {
  return value ? `Último acesso: ${dateTime(value)}` : "Último acesso: ainda não entrou";
}

function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function studyReminderIsDue(study: StudyEntry, now = new Date()) {
  if (!study.active || !study.remindersEnabled || !study.preferredTime) return false;
  const [targetHours, targetMinutes] = study.preferredTime.split(":").map(Number);
  const elapsedMinutes = now.getHours() * 60 + now.getMinutes() - (targetHours * 60 + targetMinutes);
  if (elapsedMinutes < 0 || elapsedMinutes > 5) return false;
  const currentDate = today();
  const dayId = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][now.getDay()];
  return study.nextMeetingOn === currentDate || (study.recurrence === "weekly" && (study.preferredDays ?? []).includes(dayId));
}

function recordTotals(entries: RecordEntry[]) {
  return entries.reduce(
    (sum, record) => ({
      minutes: sum.minutes + recordTotalMinutes(record),
      serviceMinutes: sum.serviceMinutes + record.minutes,
      ldcMinutes: sum.ldcMinutes + record.ldcMinutes,
      publications: sum.publications + record.publications,
      studies: sum.studies + record.studies,
    }),
    { minutes: 0, serviceMinutes: 0, ldcMinutes: 0, publications: 0, studies: 0 },
  );
}

function recordsCacheKey(userId: number, selected: Date) {
  return `user-${userId}-records-${selected.getFullYear()}-${selected.getMonth() + 1}`;
}

function yearCacheKey(userId: number, year: number) {
  return `user-${userId}-year-${year}`;
}

function cachedUserKey() {
  return "hora-a-hora-last-user";
}

function reminderKey(userId: number) {
  return `hora-a-hora-reminders-${userId}`;
}

function recordEntityKey(record: RecordEntry | null) {
  if (record?.offlineKey) return record.offlineKey;
  if (record && record.id > 0) return `record:id:${record.id}`;
  return `record:new:${crypto.randomUUID()}`;
}

function monthRequestDate(period: Date, offset: number) {
  return new Date(period.getFullYear(), period.getMonth() + offset, 1);
}

function parseStored<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

export function HoraApp({ resetToken }: { resetToken?: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [previousRecords, setPreviousRecords] = useState<RecordEntry[]>([]);
  const [yearRecords, setYearRecords] = useState<RecordEntry[]>([]);
  const [studies, setStudies] = useState<StudyEntry[]>([]);
  const [period, setPeriod] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [recordOpen, setRecordOpen] = useState(false);
  const [editing, setEditing] = useState<RecordEntry | null>(null);
  const [recordInitialDate, setRecordInitialDate] = useState<string | null>(null);
  const [quickDate, setQuickDate] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [studiesOpen, setStudiesOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [theme, setTheme] = useState<ThemeId>("blue");
  const [themeOpen, setThemeOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [reminders, setReminders] = useState<ReminderPreferences>({ enabled: false, days: 3 });
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>({ largeText: false, highContrast: false });
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const messageTimerRef = useRef<number | null>(null);
  const recordsRequestRef = useRef(0);
  const studiesRequestRef = useRef(0);

  const notify = useCallback((text: string, tone: "success" | "error" | "warning" | "info" = "info", action?: ToastMessage["action"], duration = 4200) => {
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    setMessage({ text, tone, action });
    messageTimerRef.current = window.setTimeout(() => setMessage(null), duration);
  }, []);

  useEffect(() => () => {
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
  }, []);

  useEffect(() => {
    if (!user?.trialExpiresAt) return;
    const owner = user;
    const remaining = new Date(user.trialExpiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => {
      void (async () => {
        window.localStorage.setItem(LOGOUT_PENDING_KEY, new Date().toISOString());
        try {
          await api("/api/auth/logout", { method: "POST" });
          window.localStorage.removeItem(LOGOUT_PENDING_KEY);
        } catch {
          // O marcador mantém o logout pendente para a próxima reconexão.
        }
        recordsRequestRef.current += 1;
        studiesRequestRef.current += 1;
        await clearOfflineUserData(owner.id).catch(() => undefined);
        window.localStorage.removeItem(cachedUserKey());
        window.localStorage.removeItem(`hora-a-hora-draft-${owner.id}`);
        window.localStorage.removeItem(reminderKey(owner.id));
        window.localStorage.removeItem(`hora-a-hora-timer-${owner.id}`);
        if ("serviceWorker" in navigator) {
          void navigator.serviceWorker.ready.then((registration) => {
            registration.active?.postMessage({ type: "HORA_CLEAR_PRIVATE_DATA", userId: owner.id });
          }).catch(() => undefined);
        }
        setUser(null);
        setRecords([]);
        setPreviousRecords([]);
        setYearRecords([]);
        setStudies([]);
        notify("Seu período de teste terminou.");
      })();
    }, Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [notify, user]);

  const syncReminderServiceWorker = useCallback(async (preferences: ReminderPreferences, owner?: User | null) => {
    if (!("serviceWorker" in navigator)) return;
    // Em desenvolvimento ou em navegadores que recusaram o registro, `ready`
    // pode nunca resolver. A preferência local não deve ficar travada por isso.
    const registration = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready.catch(() => null),
      new Promise((resolve) => window.setTimeout(() => resolve(null), 1_500)),
    ]);
    if (!registration) return;
    registration.active?.postMessage({
      type: "HORA_REMINDER_CONFIG",
      preferences,
      userId: owner?.id ?? null,
      createdAt: owner?.createdAt ?? null,
    });
    const periodic = registration as PeriodicSyncRegistration;
    if (!periodic?.periodicSync) return;
    try {
      if (preferences.enabled) {
        await periodic.periodicSync.register("hora-a-hora-reminder", { minInterval: 24 * 60 * 60 * 1000 });
      } else {
        await periodic.periodicSync.unregister("hora-a-hora-reminder");
      }
    } catch {
      // Alguns navegadores não liberam sincronização periódica; a verificação ao abrir o app continua funcionando.
    }
  }, []);

  const checkReminder = useCallback(async () => {
    if (!user || !reminders.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const data = await api<{ records: RecordEntry[] }>(`/api/records?latest=1&through=${today()}`);
      const latest = data.records[0]?.date ?? null;
      const reference = latest ? new Date(`${latest}T12:00:00`) : new Date(user.createdAt);
      const current = new Date(`${today()}T12:00:00`);
      const daysWithoutRecord = Math.floor((current.getTime() - reference.getTime()) / 86_400_000);
      const noticeKey = `hora-a-hora-last-reminder-${user.id}`;
      if (daysWithoutRecord < reminders.days || window.localStorage.getItem(noticeKey) === today()) return;

      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : undefined;
      const options = {
        body: `Você está há ${daysWithoutRecord} dias sem registrar suas horas. Toque para preencher agora.`,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "hora-a-hora-reminder",
      };
      if (registration) await registration.showNotification("Hora a Hora", options);
      else new Notification("Hora a Hora", options);
      window.localStorage.setItem(noticeKey, today());
    } catch {
      // A ausência momentânea de conexão não deve interromper o painel.
    }
  }, [reminders, user]);

  const loadRecords = useCallback(async (selected = period) => {
    if (!user) return;
    const requestId = ++recordsRequestRef.current;
    const requestUserId = user.id;
    const isCurrent = () => requestId === recordsRequestRef.current;
    const currentKey = recordsCacheKey(user.id, selected);
    const previous = monthRequestDate(selected, -1);
    try {
      // O mês visível é carregado isoladamente: uma falha no comparativo anual ou no
      // cache local nunca pode esconder um registro confirmado pelo servidor.
      const currentData = await api<{ records: RecordEntry[] }>(`/api/records?month=${selected.getMonth() + 1}&year=${selected.getFullYear()}`);
      if (!isCurrent()) return;
      setRecords(currentData.records);
      void offlineCacheSet(currentKey, currentData.records).catch(() => undefined);
    } catch (error) {
      const cached = await offlineCacheGet<RecordEntry[]>(currentKey).catch(() => null);
      if (!isCurrent()) return;
      if (cached !== null) {
        setRecords(cached);
        notify("Você está offline. Exibindo os dados salvos neste aparelho.", "warning");
      } else {
        setRecords([]);
        setPreviousRecords([]);
        setYearRecords([]);
        notify(error instanceof Error ? error.message : "Não foi possível carregar os registros.", "error");
      }
    }

    const [previousResult, annualResult] = await Promise.allSettled([
      api<{ records: RecordEntry[] }>(`/api/records?month=${previous.getMonth() + 1}&year=${previous.getFullYear()}`),
      api<{ records: RecordEntry[] }>(`/api/records?year=${selected.getFullYear()}`),
    ]);
    if (!isCurrent() || user.id !== requestUserId) return;
    if (previousResult.status === "fulfilled") {
      setPreviousRecords(previousResult.value.records);
      void offlineCacheSet(recordsCacheKey(user.id, previous), previousResult.value.records).catch(() => undefined);
    } else {
      const cached = await offlineCacheGet<RecordEntry[]>(recordsCacheKey(user.id, previous)).catch(() => null);
      setPreviousRecords(cached ?? []);
    }
    if (annualResult.status === "fulfilled") {
      setYearRecords(annualResult.value.records);
      void offlineCacheSet(yearCacheKey(user.id, selected.getFullYear()), annualResult.value.records).catch(() => undefined);
    } else {
      const cached = await offlineCacheGet<RecordEntry[]>(yearCacheKey(user.id, selected.getFullYear())).catch(() => null);
      setYearRecords(cached ?? []);
    }
  }, [period, user, notify]);

  const loadStudies = useCallback(async () => {
    if (!user) return;
    const requestId = ++studiesRequestRef.current;
    const key = `user-${user.id}-studies`;
    try {
      const data = await api<{ studies: StudyEntry[] }>("/api/studies");
      if (requestId !== studiesRequestRef.current) return;
      setStudies(data.studies);
      // Uma falha no cache local nunca deve substituir a lista confirmada pelo servidor.
      void offlineCacheSet(key, data.studies).catch(() => undefined);
    } catch {
      const cached = await offlineCacheGet<StudyEntry[]>(key).catch(() => null);
      if (requestId === studiesRequestRef.current) setStudies(cached ?? []);
    }
  }, [user]);

  useEffect(() => {
    if (window.localStorage.getItem(LOGOUT_PENDING_KEY)) {
      api("/api/auth/logout", { method: "POST" })
        .then(() => window.localStorage.removeItem(LOGOUT_PENDING_KEY))
        .catch(() => undefined)
        .finally(() => {
          setUser(null);
          setLoading(false);
        });
      return;
    }
    api<{ user: User | null }>("/api/auth/me")
      .then((data) => {
        setUser(data.user);
        if (data.user) window.localStorage.setItem(cachedUserKey(), JSON.stringify(data.user));
        else window.localStorage.removeItem(cachedUserKey());
      })
      .catch(() => {
        try {
          const cached = window.localStorage.getItem(cachedUserKey());
          const parsed = cached ? JSON.parse(cached) as User : null;
          const sessionIsValid = Boolean(parsed?.sessionExpiresAt && new Date(parsed.sessionExpiresAt).getTime() > Date.now());
          // Trial access is always revalidated online; localStorage cannot safely prove its validity.
          const canUseOffline = parsed && !parsed.trialExpiresAt && sessionIsValid;
          setUser(canUseOffline ? parsed : null);
          if (canUseOffline) notify("Modo offline ativado com os dados deste aparelho.", "warning");
          else if (cached) window.localStorage.removeItem(cachedUserKey());
        } catch {
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    const saved = window.localStorage.getItem("hora-a-hora-theme");
    const selected = isTheme(saved) ? saved : "blue";
    document.documentElement.dataset.theme = selected;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      "content",
      THEMES.find((item) => item.id === selected)?.color ?? "#4a6da7",
    );
    // A preferência visual é restaurada somente no navegador, após a hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(selected);
  }, []);

  useEffect(() => {
    const savedAccessibility = parseStored<AccessibilityPreferences>(ACCESSIBILITY_KEY, { largeText: false, highContrast: false });
    document.documentElement.dataset.fontSize = savedAccessibility.largeText ? "large" : "normal";
    document.documentElement.dataset.contrast = savedAccessibility.highContrast ? "high" : "normal";
    // Preferências locais são restauradas somente após a hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccessibility(savedAccessibility);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!user) {
        setReminders({ enabled: false, days: 3 });
        return;
      }
      const savedReminders = parseStored<ReminderPreferences>(reminderKey(user.id), { enabled: false, days: 3 });
      setReminders(savedReminders);
      void syncReminderServiceWorker(savedReminders, user);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [syncReminderServiceWorker, user]);

  useEffect(() => {
    if (!user || window.localStorage.getItem(`hora-a-hora-tour-${user.id}`)) return;
    const timer = window.setTimeout(() => setTourStep(0), 650);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!user || !reminders.enabled) return;
    const timer = window.setTimeout(() => void checkReminder(), 1400);
    const interval = window.setInterval(() => void checkReminder(), 6 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [checkReminder, reminders.enabled, user]);

  useEffect(() => {
    // A mudança do usuário/período deve buscar o recorte correspondente no servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    // Os estudos são carregados quando a conta ativa muda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudies();
  }, [loadStudies]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !user) return;
    const enabled = studies.filter((study) => study.active && study.remindersEnabled && study.preferredTime);
    void navigator.serviceWorker.ready.then(async (registration) => {
      registration.active?.postMessage({ type: "HORA_STUDY_SCHEDULES", userId: user.id, studies: enabled });
      const periodic = registration as PeriodicSyncRegistration;
      if (!periodic.periodicSync) return;
      try {
        if (enabled.length) await periodic.periodicSync.register("hora-a-hora-study-reminders", { minInterval: 60 * 60 * 1000 });
        else await periodic.periodicSync.unregister("hora-a-hora-study-reminders");
      } catch {
        // O verificador aberto no aplicativo continua funcionando quando o navegador não oferece sincronização periódica.
      }
    }).catch(() => undefined);
  }, [studies, user]);

  useEffect(() => {
    if (!studies.length || !("Notification" in window)) return;
    const checkIndividualReminders = async () => {
      if (Notification.permission !== "granted") return;
      for (const study of studies.filter((item) => studyReminderIsDue(item))) {
        const noticeKey = `hora-a-hora-study-reminder-${user?.id}-${study.id}`;
        const noticeValue = `${today()}-${study.preferredTime}`;
        if (window.localStorage.getItem(noticeKey) === noticeValue) continue;
        const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : undefined;
        const body = `${studyScheduleLabel(study) || study.preferredTime}${study.address ? ` · ${study.address}` : ""}`;
        if (registration) await registration.showNotification(`Estudo com ${study.name}`, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: noticeKey, data: { studyReminder: true, url: `/estudantes/${study.id}` } });
        else new Notification(`Estudo com ${study.name}`, { body, tag: noticeKey });
        window.localStorage.setItem(noticeKey, noticeValue);
      }
    };
    void checkIndividualReminders();
    const interval = window.setInterval(() => void checkIndividualReminders(), 30_000);
    return () => window.clearInterval(interval);
  }, [studies, user?.id]);

  const synchronize = useCallback(async (showMessage = false) => {
    if (!user || !navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await syncOfflineMutations(user.id, { retryBlocked: showMessage });
      setPendingSync(result.pending);
      if (result.synced && result.status === "complete") {
        await clearOfflineUserCaches(user.id);
        await Promise.all([loadRecords(), loadStudies()]);
      } else if (result.synced) {
        await Promise.all([loadRecords(), loadStudies()]);
      }
      if (result.status === "auth-required") {
        recordsRequestRef.current += 1;
        studiesRequestRef.current += 1;
        window.localStorage.removeItem(cachedUserKey());
        setUser(null);
        setRecords([]);
        setStudies([]);
        notify("Sua sessão expirou. Entre novamente para sincronizar as alterações pendentes.", "warning");
      } else if (result.status === "blocked") {
        notify(result.issues[0]?.message ?? "Há alterações pendentes que precisam ser revisadas.", "error");
      } else if (showMessage && result.synced) {
        notify(`${result.synced} alteração${result.synced === 1 ? "" : "ões"} sincronizada${result.synced === 1 ? "" : "s"}.`, "success");
      } else if (showMessage && result.pending) {
        notify("Ainda há alterações pendentes; tentaremos novamente ao reconectar.", "warning");
      } else if (showMessage) {
        notify("Todos os dados já estão sincronizados.", "success");
      }
    } catch {
      if (showMessage) notify("A sincronização será tentada novamente automaticamente.", "warning");
    } finally {
      setSyncing(false);
    }
  }, [loadRecords, loadStudies, notify, user]);

  useEffect(() => {
    const updateConnection = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) return;
      if (window.localStorage.getItem(LOGOUT_PENDING_KEY)) {
        void api("/api/auth/logout", { method: "POST" })
          .then(() => window.localStorage.removeItem(LOGOUT_PENDING_KEY))
          .catch(() => undefined);
      }
      void synchronize();
    };
    const initialCheck = window.setTimeout(updateConnection, 0);
    if (user) void offlinePendingCount(user.id).then(setPendingSync);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.clearTimeout(initialCheck);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [synchronize, user]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const totals = useMemo(() => recordTotals(records), [records]);
  const previousTotals = useMemo(() => recordTotals(previousRecords), [previousRecords]);
  const monthlyStudies = useMemo(() => studies.filter((study) => studyIsActiveInMonth(study, period.getFullYear(), period.getMonth() + 1)), [period, studies]);
  const activeStudies = monthlyStudies.length;
  const selectedStudents = useMemo(() => new Set(records.flatMap((record) => record.studyIds ?? [])).size, [records]);
  const exactStudies = selectedStudents || (studies.length ? activeStudies : totals.studies);
  const attentionStudies = useMemo(() => studies.filter((study) => studyNeedsAttention(study)).sort((a, b) => daysSinceDate(b.lastContactOn || b.startedOn) - daysSinceDate(a.lastContactOn || a.startedOn)), [studies]);

  const progress = user ? Math.min(100, Math.round((totals.minutes / (user.goalHours * 60)) * 100)) : 0;
  const difference = user ? user.goalHours * 60 - totals.minutes : 0;

  const weekly = useMemo(() => {
    const values = Array(7).fill(0) as number[];
    records.forEach((record) => {
      const day = new Date(`${record.date}T12:00:00`).getDay();
      values[day] += recordTotalMinutes(record);
    });
    return values;
  }, [records]);
  const weeklyMax = Math.max(...weekly, 60);

  const calendarDays = useMemo(() => {
    const year = period.getFullYear();
    const month = period.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: totalDays }, (_, index) => {
        const day = index + 1;
        const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const record = records.find((item) => item.date === date) ?? null;
        const status = record ? (recordTotalMinutes(record) > 0 ? "filled" : "no-hours") : date <= today() ? "pending" : "upcoming";
        return { day, date, record, status };
      }),
    ];
  }, [period, records]);
  const quickRecord = quickDate ? records.find((record) => record.date === quickDate) ?? null : null;
  const firstName = user?.name.trim().split(/\s+/)[0] || "Visitante";

  function changePeriod(offset: number) {
    const next = new Date(period.getFullYear(), period.getMonth() + offset, 1);
    setPeriod(next);
  }

  function openNewRecord(date?: string) {
    setEditing(null);
    setRecordInitialDate(date ?? null);
    setRecordOpen(true);
  }

  async function openTodayRecord() {
    const current = new Date();
    const currentPeriod = new Date(current.getFullYear(), current.getMonth(), 1);
    setMobileOpen(false);
    setPeriod(currentPeriod);
    await loadRecords(currentPeriod);
    setQuickDate(today());
  }

  function navigateTo(view: ActiveView) {
    setActiveView(view);
    setMobileOpen(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  async function persistRecord(
    target: RecordEntry | null,
    input: RecordFormInput,
  ) {
    setBusy(true);
    const updatingServerRecord = Boolean(target && target.id > 0);
    const url = updatingServerRecord ? `/api/records/${target?.id}` : "/api/records";
    const method = updatingServerRecord ? "PUT" : "POST";
    const entityKey = recordEntityKey(target);
    const payload = updatingServerRecord && target?.updatedAt
      ? { ...input, expectedUpdatedAt: target.updatedAt }
      : input;
    try {
      const result = await api<{ record: RecordEntry; created?: boolean }>(url, {
        method,
        body: JSON.stringify(payload),
      });
      if (!target && user) window.localStorage.removeItem(`hora-a-hora-draft-${user.id}`);
      const selected = new Date(`${input.date}T12:00:00`);
      const selectedPeriod = new Date(selected.getFullYear(), selected.getMonth(), 1);
      const mergeSaved = (items: RecordEntry[]) => [...items.filter((item) =>
        item.date !== result.record.date && item.id !== target?.id && item.offlineKey !== target?.offlineKey), result.record]
        .sort((a, b) => a.date.localeCompare(b.date));
      const sameVisiblePeriod = selectedPeriod.getFullYear() === period.getFullYear() && selectedPeriod.getMonth() === period.getMonth();
      setPeriod(selectedPeriod);
      setRecords((current) => sameVisiblePeriod ? mergeSaved(current) : [result.record]);
      if (selectedPeriod.getFullYear() === period.getFullYear()) setYearRecords((current) => mergeSaved(current));
      // A resposta do POST/PUT é a confirmação do banco e aparece imediatamente.
      // A recarga seguinte apenas reconcilia os demais painéis e não depende do IndexedDB.
      await loadRecords(selectedPeriod);
      notify(target || result.created === false ? "Registro atualizado com sucesso." : "Registro salvo com sucesso.", "success");
      return true;
    } catch (error) {
      const connectionFailure = !navigator.onLine || (error instanceof Error && /conectar|internet/i.test(error.message));
      if (!user || !connectionFailure) {
        if (error instanceof ApiError && error.status === 409) await loadRecords().catch(() => undefined);
        notify(error instanceof Error ? error.message : "Não foi possível salvar.", "error");
        return false;
      }
      await queueOfflineMutation({ userId: user.id, method, url, body: payload, entityKey });
      const service = input.hours * 60 + input.minutes;
      const ldc = input.ldcHours * 60 + input.ldcMinutes;
      const optimistic: RecordEntry = {
        id: target?.id ?? -Date.now(),
        date: input.date,
        weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date(`${input.date}T12:00:00`)),
        minutes: service,
        ldcMinutes: ldc,
        publications: input.publications,
        studies: input.studies,
        studyIds: input.studyIds,
        studyNames: input.studyIds.map((id) => studies.find((study) => study.id === id)?.name).filter((name): name is string => Boolean(name)),
        notes: input.notes,
        month: Number(input.date.slice(5, 7)),
        year: Number(input.date.slice(0, 4)),
        createdAt: target?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        offlineKey: entityKey,
      };
      const updateList = (items: RecordEntry[]) => [...items.filter((item) =>
        item.date !== input.date && item.id !== target?.id && item.offlineKey !== entityKey), optimistic]
        .sort((a, b) => a.date.localeCompare(b.date));
      const selected = new Date(`${input.date}T12:00:00`);
      const selectedPeriod = new Date(selected.getFullYear(), selected.getMonth(), 1);
      const sameVisiblePeriod = selectedPeriod.getFullYear() === period.getFullYear() && selectedPeriod.getMonth() === period.getMonth();
      const baseRecords = sameVisiblePeriod ? records : await offlineCacheGet<RecordEntry[]>(recordsCacheKey(user.id, selectedPeriod)) ?? [];
      const nextRecords = updateList(baseRecords);
      setPeriod(selectedPeriod);
      setRecords(nextRecords);
      const annualKey = yearCacheKey(user.id, selectedPeriod.getFullYear());
      const baseYear = selectedPeriod.getFullYear() === period.getFullYear()
        ? yearRecords
        : await offlineCacheGet<RecordEntry[]>(annualKey) ?? [];
      const nextYear = updateList(baseYear);
      setYearRecords(nextYear);
      await Promise.all([
        offlineCacheSet(recordsCacheKey(user.id, selectedPeriod), nextRecords),
        offlineCacheSet(annualKey, nextYear),
      ]);
      if (target && (target.month !== optimistic.month || target.year !== optimistic.year)) {
        const oldPeriod = new Date(target.year, target.month - 1, 1);
        const oldMonthKey = recordsCacheKey(user.id, oldPeriod);
        const oldMonth = await offlineCacheGet<RecordEntry[]>(oldMonthKey) ?? [];
        await offlineCacheSet(oldMonthKey, oldMonth.filter((item) => item.id !== target.id && item.offlineKey !== entityKey));
        const oldAnnualKey = yearCacheKey(user.id, target.year);
        const oldYear = await offlineCacheGet<RecordEntry[]>(oldAnnualKey) ?? [];
        await offlineCacheSet(oldAnnualKey, oldYear.filter((item) => item.id !== target.id && item.offlineKey !== entityKey));
      }
      const count = await offlinePendingCount(user.id);
      setPendingSync(count);
      if (!target) window.localStorage.removeItem(`hora-a-hora-draft-${user.id}`);
      notify("Registro salvo neste aparelho. Ele será sincronizado quando houver internet.", "warning");
      return true;
    } finally { setBusy(false); }
  }

  async function finishTimer(category: TimerCategory, addedMinutes: number) {
    if (!user) return;
    const current = new Date();
    const currentPeriod = new Date(current.getFullYear(), current.getMonth(), 1);
    let available = records;
    if (period.getFullYear() !== current.getFullYear() || period.getMonth() !== current.getMonth()) {
      try {
        available = (await api<{ records: RecordEntry[] }>(`/api/records?month=${current.getMonth() + 1}&year=${current.getFullYear()}`)).records;
      } catch {
        available = await offlineCacheGet<RecordEntry[]>(recordsCacheKey(user.id, currentPeriod)) ?? [];
      }
    }
    const existing = available.find((record) => record.date === today()) ?? null;
    const currentTotal = category === "service" ? existing?.minutes ?? 0 : existing?.ldcMinutes ?? 0;
    if (currentTotal + addedMinutes > MAX_RECORD_HOURS * 60) {
      const error = new Error(`O total ultrapassaria o limite de ${MAX_RECORD_HOURS} horas. O cronômetro foi mantido para você revisar.`);
      notify(error.message, "error");
      throw error;
    }
    const timerInput = { date: today(), category, minutes: addedMinutes };
    try {
      const result = await api<{ record: RecordEntry }>("/api/records/timer", { method: "POST", body: JSON.stringify(timerInput) });
      const selectedPeriod = currentPeriod;
      setPeriod(selectedPeriod);
      setRecords((items) => [...items.filter((item) => item.date !== result.record.date), result.record].sort((a, b) => a.date.localeCompare(b.date)));
      await loadRecords(selectedPeriod);
      notify("Tempo do cronômetro adicionado ao registro de hoje.", "success");
    } catch (error) {
      const connectionFailure = !navigator.onLine || (error instanceof Error && /conectar|internet/i.test(error.message));
      if (!connectionFailure) {
        notify(error instanceof Error ? error.message : "O cronômetro não pôde ser salvo.", "error");
        throw error;
      }
      // Timer changes stay additive in the outbox; the server applies each one atomically.
      try {
        await queueOfflineMutation({ userId: user.id, method: "POST", url: "/api/records/timer", body: timerInput });
      } catch {
        const storageError = new Error("Sem conexão e sem acesso ao armazenamento offline. O cronômetro foi mantido para você tentar novamente.");
        notify(storageError.message, "error");
        throw storageError;
      }
      const optimistic: RecordEntry = existing ? {
        ...existing,
        minutes: existing.minutes + (category === "service" ? addedMinutes : 0),
        ldcMinutes: existing.ldcMinutes + (category === "ldc" ? addedMinutes : 0),
        updatedAt: new Date().toISOString(),
      } : {
        id: -Date.now(), date: today(),
        weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date(`${today()}T12:00:00`)),
        minutes: category === "service" ? addedMinutes : 0,
        ldcMinutes: category === "ldc" ? addedMinutes : 0,
        publications: 0, studies: 0, studyIds: [], studyNames: [], notes: "",
        month: current.getMonth() + 1, year: current.getFullYear(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        offlineKey: `record:timer:${today()}`,
      };
      const merge = (items: RecordEntry[]) => [...items.filter((item) => item.date !== optimistic.date), optimistic].sort((a, b) => a.date.localeCompare(b.date));
      const nextMonth = merge(available);
      const annualKey = yearCacheKey(user.id, current.getFullYear());
      const annualBase = await offlineCacheGet<RecordEntry[]>(annualKey) ?? (period.getFullYear() === current.getFullYear() ? yearRecords : []);
      const nextYear = merge(annualBase);
      setPeriod(currentPeriod);
      setRecords(nextMonth);
      setYearRecords(nextYear);
      await Promise.all([
        offlineCacheSet(recordsCacheKey(user.id, currentPeriod), nextMonth),
        offlineCacheSet(annualKey, nextYear),
      ]);
      setPendingSync(await offlinePendingCount(user.id));
      notify("Tempo salvo neste aparelho e aguardando sincronização.", "warning");
    }
  }

  async function changeReminders(next: ReminderPreferences) {
    if (next.enabled) {
      if (!("Notification" in window)) {
        notify("Este navegador não oferece notificações.");
        return;
      }
      let permission = Notification.permission;
      if (permission === "default") {
        try {
          const request = Notification.requestPermission() as Promise<NotificationPermission> | undefined;
          permission = request ? await request : Notification.permission;
        } catch {
          permission = Notification.permission;
        }
      }
      if (permission !== "granted") {
        notify("Permita as notificações do site para ativar os lembretes.");
        return;
      }
    }
    setReminders(next);
    if (!user) return;
    window.localStorage.setItem(reminderKey(user.id), JSON.stringify(next));
    await syncReminderServiceWorker(next, user);
    notify(next.enabled ? `Lembrete ativado após ${next.days} dias sem registro.` : "Lembretes desativados.", "success");
  }

  function changeAccessibility(next: AccessibilityPreferences) {
    setAccessibility(next);
    document.documentElement.dataset.fontSize = next.largeText ? "large" : "normal";
    document.documentElement.dataset.contrast = next.highContrast ? "high" : "normal";
    window.localStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(next));
  }

  function startTour() {
    setSettingsOpen(false);
    setMobileOpen(false);
    setTourStep(0);
  }

  function finishTour() {
    if (user) window.localStorage.setItem(`hora-a-hora-tour-${user.id}`, "seen");
    setTourStep(null);
  }

  async function logout() {
    if (!user) return;
    const owner = user;
    const pending = await offlinePendingCount(owner.id).catch(() => 0);
    let timerPending = false;
    try {
      timerPending = timerElapsed(parseStoredTimer(window.localStorage.getItem(`hora-a-hora-timer-${owner.id}`)), Date.now()) > 0;
    } catch { /* O armazenamento local pode estar bloqueado. */ }
    if ((pending || timerPending) && !window.confirm([
      pending ? `Há ${pending} alteração${pending === 1 ? "" : "ões"} ainda não sincronizada${pending === 1 ? "" : "s"}.` : "",
      timerPending ? "Há um cronômetro em andamento ou pausado." : "",
      "Sair agora excluirá esses dados deste aparelho. Deseja continuar?",
    ].filter(Boolean).join(" "))) return;
    window.localStorage.setItem(LOGOUT_PENDING_KEY, new Date().toISOString());
    try {
      await api("/api/auth/logout", { method: "POST" });
      window.localStorage.removeItem(LOGOUT_PENDING_KEY);
    } catch {
      notify("Você saiu deste aparelho. O encerramento no servidor será confirmado quando a internet voltar.", "warning");
    } finally {
      recordsRequestRef.current += 1;
      studiesRequestRef.current += 1;
      await clearOfflineUserData(owner.id).catch(() => undefined);
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.ready.then((registration) => {
          registration.active?.postMessage({ type: "HORA_CLEAR_PRIVATE_DATA", userId: owner.id });
        }).catch(() => undefined);
      }
      setUser(null);
      setRecords([]);
      setPreviousRecords([]);
      setYearRecords([]);
      setStudies([]);
      window.localStorage.removeItem(cachedUserKey());
      window.localStorage.removeItem(`hora-a-hora-draft-${owner.id}`);
      window.localStorage.removeItem(reminderKey(owner.id));
      window.localStorage.removeItem(`hora-a-hora-timer-${owner.id}`);
      setMobileOpen(false);
    }
  }

  async function installApp() {
    setMobileOpen(false);
    if (!installPrompt) {
      notify("No Android, abra o menu do Chrome e toque em “Instalar app”.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  function selectTheme(next: ThemeId) {
    setTheme(next);
    setThemeOpen(false);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("hora-a-hora-theme", next);
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
      "content",
      THEMES.find((item) => item.id === next)?.color ?? "#4a6da7",
    );
  }

  async function restoreDeletedRecord(record: RecordEntry, keepServerIdentity: boolean) {
    const input: RecordFormInput = {
      date: record.date,
      hours: Math.floor(record.minutes / 60),
      minutes: record.minutes % 60,
      ldcHours: Math.floor(record.ldcMinutes / 60),
      ldcMinutes: record.ldcMinutes % 60,
      publications: record.publications,
      studies: record.studies,
      studyIds: record.studyIds ?? [],
      notes: record.notes,
    };
    const restored = await persistRecord(keepServerIdentity ? record : null, input);
    if (restored) notify("Exclusão desfeita e registro restaurado.", "success");
  }

  async function deleteRecord(record: RecordEntry) {
    if (!window.confirm(`Excluir o registro de ${fullDate(record.date)}?`)) return;
    const recordPeriod = new Date(record.year, record.month - 1, 1);
    const sameVisiblePeriod = record.year === period.getFullYear() && record.month === period.getMonth() + 1;
    const removeFromViews = async () => {
      if (!user) return;
      const monthBase = sameVisiblePeriod
        ? records
        : await offlineCacheGet<RecordEntry[]>(recordsCacheKey(user.id, recordPeriod)).catch(() => null) ?? [];
      const nextMonth = monthBase.filter((item) => item.id !== record.id && item.offlineKey !== record.offlineKey);
      const nextYear = yearRecords.filter((item) => item.id !== record.id && item.offlineKey !== record.offlineKey);
      if (sameVisiblePeriod) setRecords(nextMonth);
      setYearRecords(nextYear);
      await Promise.all([
        offlineCacheSet(recordsCacheKey(user.id, recordPeriod), nextMonth),
        offlineCacheSet(yearCacheKey(user.id, record.year), nextYear),
      ]).catch(() => undefined);
    };
    if (record.id <= 0 && user) {
      const entityKey = recordEntityKey(record);
      await removeQueuedEntityChanges(user.id, entityKey);
      await removeFromViews();
      setPendingSync(await offlinePendingCount(user.id));
      notify("Registro offline excluído.", "success", { label: "Desfazer", onClick: () => void restoreDeletedRecord(record, false) }, 7000);
      return;
    }
    try {
      await api(`/api/records/${record.id}`, { method: "DELETE" });
      await removeFromViews();
      notify("Registro excluído.", "success", { label: "Desfazer", onClick: () => void restoreDeletedRecord(record, false) }, 7000);
    } catch (error) {
      const connectionFailure = !navigator.onLine || (error instanceof Error && /conectar|internet/i.test(error.message));
      if (!user || !connectionFailure || record.id <= 0) {
        notify(error instanceof Error ? error.message : "Não foi possível excluir.", "error");
        return;
      }
      const entityKey = recordEntityKey(record);
      await queueOfflineMutation({ userId: user.id, method: "DELETE", url: `/api/records/${record.id}`, entityKey });
      await removeFromViews();
      setPendingSync(await offlinePendingCount(user.id));
      notify("Exclusão salva neste aparelho e aguardando sincronização.", "warning", { label: "Desfazer", onClick: () => void restoreDeletedRecord(record, true) }, 7000);
    }
  }

  function exportCsv(entries: RecordEntry[] = records, fileLabel = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, "0")}`) {
    const rows = [
      ["Data", "Dia", "Serviço", "Minutos de serviço", "LDC", "Minutos LDC", "Total", "Publicações", "Sessões de estudo", "Estudantes acompanhados", "Preferência dos estudos", "Assunto atual", "Progresso dos estudantes", "Endereço dos estudos", "Anotações"],
      ...entries.map((record) => [
        record.date,
        record.weekday,
        (record.minutes / 60).toFixed(2).replace(".", ","),
        record.minutes,
        (record.ldcMinutes / 60).toFixed(2).replace(".", ","),
        record.ldcMinutes,
        recordTotalMinutes(record),
        record.publications,
        record.studies,
        record.studyNames?.join(", ") ?? "",
        (record.studyIds ?? []).map((id) => studies.find((study) => study.id === id)).filter((study): study is StudyEntry => Boolean(study)).map(studyScheduleLabel).filter(Boolean).join("; "),
        (record.studyIds ?? []).map((id) => studies.find((study) => study.id === id)?.currentSubject).filter(Boolean).join("; "),
        (record.studyIds ?? []).map((id) => studies.find((study) => study.id === id)).filter((study): study is StudyEntry => Boolean(study)).map((study) => `${study.name}: ${study.progress}%`).join("; "),
        (record.studyIds ?? []).map((id) => studies.find((study) => study.id === id)?.address).filter(Boolean).join("; "),
        record.notes,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.download = `hora-a-hora-${fileLabel}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function reportSummary() {
    if (!user) return "";
    const reportedTotal = roundReportMinutes(totals.minutes, user.roundingMode);
    const exactLine = reportedTotal === totals.minutes ? "" : `\nTempo exato registrado: ${hoursLabel(totals.minutes)}`;
    return `Relatório Hora a Hora — ${MONTHS[period.getMonth()]} de ${period.getFullYear()}\nTotal do relatório: ${hoursLabel(reportedTotal)}${exactLine}\nServiço: ${hoursLabel(totals.serviceMinutes)}\nLDC: ${hoursLabel(totals.ldcMinutes)}\nPublicações: ${totals.publications}\nEstudos: ${exactStudies}`;
  }

  async function downloadPdf() {
    if (!user) return;
    try {
      const { downloadMonthlyPdf } = await import("@/lib/pdf-report");
      downloadMonthlyPdf({ user, records, month: period.getMonth() + 1, year: period.getFullYear(), themeColor: THEMES.find((item) => item.id === theme)?.color, activeStudies: exactStudies, studyDirectory: monthlyStudies });
    } catch {
      notify("Não foi possível gerar o PDF neste navegador.", "error");
    }
  }

  async function shareReport() {
    if (!user) return;
    try {
      const { createMonthlyPdf } = await import("@/lib/pdf-report");
      const doc = createMonthlyPdf({ user, records, month: period.getMonth() + 1, year: period.getFullYear(), themeColor: THEMES.find((item) => item.id === theme)?.color, activeStudies: exactStudies, studyDirectory: monthlyStudies });
      const blob = doc.output("blob");
      const file = new File([blob], `hora-a-hora-${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, "0")}.pdf`, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "Relatório Hora a Hora", text: reportSummary(), files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: "Relatório Hora a Hora", text: reportSummary() });
      } else {
        await navigator.clipboard.writeText(reportSummary());
        notify("Resumo copiado. Agora você pode colar no aplicativo desejado.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify("Não foi possível gerar ou abrir o compartilhamento neste navegador.", "error");
    }
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(reportSummary())}`, "_blank", "noopener,noreferrer");
  }

  async function requestStudyReminderPermission(enabled: boolean) {
    if (!enabled || !("Notification" in window)) return;
    let permission = Notification.permission;
    if (permission === "default") {
      try {
        const request = Notification.requestPermission() as Promise<NotificationPermission> | undefined;
        permission = request ? await request : Notification.permission;
      } catch {
        permission = Notification.permission;
      }
    }
    if (permission !== "granted") notify("O acompanhamento foi salvo, mas o navegador precisa permitir notificações para enviar o lembrete.");
  }

  async function createStudy(input: StudyForm) {
    if (!user) return false;
    setBusy(true);
    try {
      await requestStudyReminderPermission(input.remindersEnabled);
      const result = await api<{ study: StudyEntry }>("/api/studies", { method: "POST", body: JSON.stringify(input) });
      const next = [...studies, result.study].sort((a, b) => a.name.localeCompare(b.name));
      setStudies(next);
      void offlineCacheSet(`user-${user.id}-studies`, next).catch(() => undefined);
      notify("Estudo cadastrado.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível cadastrar o estudo.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateStudy(study: StudyEntry, input: Partial<StudyEntry>) {
    if (!user) return false;
    setBusy(true);
    try {
      if (input.remindersEnabled === true) await requestStudyReminderPermission(true);
      const result = await api<{ study: StudyEntry }>(`/api/studies/${study.id}`, { method: "PATCH", body: JSON.stringify(input) });
      const next = studies.map((item) => item.id === study.id ? result.study : item).sort((a, b) => a.name.localeCompare(b.name));
      setStudies(next);
      void offlineCacheSet(`user-${user.id}-studies`, next).catch(() => undefined);
      notify(input.active === false ? "Estudo encerrado." : input.active === true ? "Estudo reativado." : "Estudo atualizado.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar o estudo.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteStudy(study: StudyEntry) {
    if (!user) return;
    if (!window.confirm(`Excluir definitivamente “${study.name}”?`)) return;
    setBusy(true);
    try {
      await api(`/api/studies/${study.id}`, { method: "DELETE" });
      const next = studies.filter((item) => item.id !== study.id);
      setStudies(next);
      void offlineCacheSet(`user-${user.id}-studies`, next).catch(() => undefined);
      notify("Estudo excluído.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível excluir o estudo.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingScreen />;
  if (!user) return (
    <>
      <AuthScreen
        resetToken={resetToken}
        onAuthenticated={(authenticated) => {
          setUser(authenticated);
          window.localStorage.setItem(cachedUserKey(), JSON.stringify(authenticated));
        }}
        notify={notify}
        theme={theme}
        themeOpen={themeOpen}
        onToggleTheme={() => setThemeOpen((open) => !open)}
        onSelectTheme={selectTheme}
      />
      {message && <Toast message={message} />}
    </>
  );

  const desktopActions = (
    <>
      <button type="button" className={`sync-status ${online ? "online" : "offline"}`} onClick={() => void synchronize(true)} disabled={!online || syncing} title={online ? "Dados sincronizados com sua conta" : "Os registros serão sincronizados ao reconectar"}>
        {syncing ? <RefreshCw size={16} className="spin" /> : online ? <Wifi size={16} /> : <WifiOff size={16} />}
        <span>{syncing ? "Sincronizando" : online ? pendingSync ? `${pendingSync} pendente${pendingSync === 1 ? "" : "s"}` : "Sincronizado" : "Modo offline"}</span>
      </button>
      <button className="header-avatar" onClick={() => setSettingsOpen(true)} aria-label={`Abrir conta de ${firstName}`}><span>{firstName.charAt(0).toUpperCase()}</span><span><strong>{firstName}</strong><small>Minha conta</small></span></button>
      <ThemePicker
        theme={theme}
        open={themeOpen}
        onToggle={() => setThemeOpen((open) => !open)}
        onSelect={selectTheme}
      />
      <button className="header-link" onClick={installApp}><Download size={17} /> Instalar no Android</button>
      {user.role === "admin" && (
        <button className="header-link" onClick={() => setAdminOpen(true)}><ShieldCheck size={17} /> Administração</button>
      )}
      <button className="icon-button" aria-label="Sair" title="Sair" onClick={logout}><LogOut size={19} /></button>
    </>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand compact />
          <nav className="desktop-nav">{desktopActions}</nav>
          <button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {mobileOpen && <nav className="mobile-nav">{desktopActions}</nav>}
        <nav className="workspace-nav" aria-label="Áreas do aplicativo">
          <button type="button" className={activeView === "home" ? "active" : ""} aria-current={activeView === "home" ? "page" : undefined} onClick={() => navigateTo("home")}><Home size={17} /> Início</button>
          <button type="button" className={activeView === "history" ? "active" : ""} aria-current={activeView === "history" ? "page" : undefined} onClick={() => navigateTo("history")}><CalendarDays size={17} /> Histórico</button>
          <button type="button" className={activeView === "studies" ? "active" : ""} aria-current={activeView === "studies" ? "page" : undefined} onClick={() => navigateTo("studies")}><BookHeart size={17} /> Estudantes</button>
          <button type="button" className={activeView === "reports" ? "active" : ""} aria-current={activeView === "reports" ? "page" : undefined} onClick={() => navigateTo("reports")}><FileDown size={17} /> Relatórios</button>
        </nav>
      </header>

      <main className="dashboard" id="inicio">
        {user.trialExpiresAt && (
          <section className="trial-access-banner" role="status">
            <span><Timer size={20} /></span>
            <div><strong>Conta de teste por 24 horas</strong><small>Seu acesso fica disponível até {dateTime(user.trialExpiresAt)}.</small></div>
          </section>
        )}
        {activeView === "home" && <>
        <section className="welcome-row">
          <div>
            <p className="eyebrow"><Sparkles size={14} /> Seu painel pessoal</p>
            <h1>{greeting()}, {firstName}!</h1>
            <p>Você já registrou <strong>{hoursLabel(totals.minutes)}</strong> em {MONTHS[period.getMonth()].toLowerCase()}. <span>{difference > 0 ? `Faltam ${hoursLabel(difference)} para sua meta.` : difference < 0 ? `Você está ${hoursLabel(Math.abs(difference))} acima da meta.` : "Sua meta foi alcançada!"}</span></p>
          </div>
          <div className="period-actions">
            <div className="month-switcher">
              <button aria-label="Mês anterior" onClick={() => changePeriod(-1)}><ChevronLeft size={20} /></button>
              <div><span>{MONTHS[period.getMonth()]}</span><small>{period.getFullYear()}</small></div>
              <button aria-label="Próximo mês" onClick={() => changePeriod(1)}><ChevronRight size={20} /></button>
            </div>
            <button className="button secondary" data-tour="add" onClick={() => openNewRecord()}>
              <Plus size={19} /> Registrar outro dia
            </button>
          </div>
        </section>

        <section className="today-action-card" aria-label="Registrar horas de hoje">
          <div className="today-action-icon"><CalendarDays size={28} /></div>
          <div className="today-action-copy"><span>Registro de hoje</span><strong>{fullDate(today())}</strong><small>Preencha suas horas em poucos segundos.</small></div>
          <button type="button" className="button primary today-action-button" onClick={() => void openTodayRecord()}><Plus size={22} /> Registrar hoje</button>
        </section>

        <section className="monthly-progress-section" aria-label="Progresso mensal">
          <article className="progress-card" data-tour="goal">
            <div className="progress-copy">
              <span className="card-label">Progresso mensal</span>
              <strong>{hoursLabel(totals.minutes)}</strong>
              <p>de {user.goalHours} horas planejadas</p>
              <div className="linear-track"><span style={{ width: `${progress}%` }} /></div>
              <small>{difference > 0 ? `Faltam ${hoursLabel(difference)}` : difference < 0 ? `${hoursLabel(Math.abs(difference))} acima da meta` : "Meta alcançada!"}</small>
            </div>
            <div className="progress-ring" role="progressbar" aria-label="Progresso da meta mensal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
              <span>{progress}%</span>
            </div>
          </article>
        </section>

        <section className="quick-tools-grid">
          <TimerCard userId={user.id} onFinish={finishTimer} />
          <article className="study-quick-card">
            <span className="study-quick-icon"><BookHeart size={25} /></span>
            <div><span className="card-label">Estudos acompanhados</span><strong>{activeStudies} {activeStudies === 1 ? "estudo ativo" : "estudos ativos"}</strong><p>{attentionStudies.length ? `${attentionStudies.length} precisam de acompanhamento.` : "Agenda e acompanhamentos em dia."}</p></div>
            <button type="button" className="button secondary" onClick={() => setStudiesOpen(true)}><BookOpen size={17} /> Gerenciar estudos</button>
          </article>
        </section>

        {attentionStudies.length > 0 && (
          <section className="student-attention-panel" aria-label="Estudantes que precisam de acompanhamento">
            <div className="student-attention-heading"><span><TriangleAlert size={21} /></span><div><strong>{attentionStudies.length} {attentionStudies.length === 1 ? "estudante precisa" : "estudantes precisam"} de atenção</strong><small>O limite é configurado individualmente na ficha de acompanhamento.</small></div></div>
            <div className="student-attention-list">
              {attentionStudies.slice(0, 5).map((study) => {
                const days = daysSinceDate(study.lastContactOn || study.startedOn);
                return <a href={`/estudantes/${study.id}`} key={study.id}><span><strong>{study.name}</strong><small>{study.lastContactOn ? `Último acompanhamento há ${days} dias` : `Sem encontro registrado há ${days} dias`}</small></span><ChevronRight size={17} /></a>;
              })}
            </div>
          </section>
        )}

        <section className="summary-grid" aria-label="Resumo do mês">
          <StatCard icon={<Clock3 />} label="Serviço" value={hoursLabel(totals.serviceMinutes)} hint={`${records.length} ${records.length === 1 ? "registro" : "registros"}`} />
          <StatCard icon={<Timer />} label="Horas LDC" value={hoursLabel(totals.ldcMinutes)} hint="Atividades aprovadas" />
          <StatCard icon={<BookOpen />} label="Publicações" value={String(totals.publications)} hint="Total no período" />
          <StatCard icon={<UsersRound />} label="Estudos" value={String(exactStudies)} hint={studies.length ? "Contagem única" : "Contagem dos registros antigos"} />
        </section>

        <section className="panel calendar-panel" data-tour="calendar" id="calendario">
          <div className="panel-heading calendar-heading">
            <div><span className="card-label">Calendário mensal</span><h2>Preencha suas horas dia a dia</h2><p>Toque em qualquer dia para fazer um registro rápido.</p></div>
            <button type="button" className={`reminder-button ${reminders.enabled ? "active" : ""}`} onClick={() => setSettingsOpen(true)}><Bell size={17} /> {reminders.enabled ? `Após ${reminders.days} dias` : "Ativar lembretes"}</button>
          </div>
          <div className="calendar-legend" aria-label="Legenda do calendário">
            <span className="filled"><i /> Preenchido</span>
            <span className="pending"><i /> Pendente</span>
            <span className="no-hours"><i /> Sem horas</span>
          </div>
          <div className="month-calendar month-transition" key={`${period.getFullYear()}-${period.getMonth()}`}>
            {DAY_LABELS.map((label) => <span className="calendar-weekday" key={label}>{label}</span>)}
            {calendarDays.map((item, index) => item ? (
              <button
                type="button"
                key={item.date}
                className={`calendar-day ${item.status} ${item.date === today() ? "today" : ""}`}
                aria-label={`${fullDate(item.date)}: ${item.status === "filled" ? hoursLabel(item.record ? recordTotalMinutes(item.record) : 0) : item.status === "no-hours" ? "registro sem horas" : item.status === "pending" ? "registro pendente" : "dia futuro"}`}
                onClick={() => setQuickDate(item.date)}
              >
                <span>{item.day}</span>
                <strong>{item.record ? hoursLabel(recordTotalMinutes(item.record)) : item.status === "pending" ? "Pendente" : "Adicionar"}</strong>
                <Zap size={13} />
              </button>
            ) : <span className="calendar-empty" key={`empty-${index}`} />)}
          </div>
        </section>
        </>}

        {activeView === "reports" && <>
        <header className="workspace-heading reports-workspace-heading">
          <div><span className="card-label">Relatórios e desempenho</span><h1>Analise e compartilhe seus resultados</h1><p>Comparativos, evolução anual e arquivos do mês selecionado em um único lugar.</p></div>
          <div className="period-actions"><div className="month-switcher"><button type="button" aria-label="Mês anterior" onClick={() => changePeriod(-1)}><ChevronLeft size={20} /></button><div><span>{MONTHS[period.getMonth()]}</span><small>{period.getFullYear()}</small></div><button type="button" aria-label="Próximo mês" onClick={() => changePeriod(1)}><ChevronRight size={20} /></button></div></div>
        </header>
        <section className="summary-grid report-summary-grid" aria-label="Resumo do relatório">
          <StatCard icon={<Clock3 />} label="Serviço" value={hoursLabel(totals.serviceMinutes)} hint={`${records.length} dias registrados`} />
          <StatCard icon={<Timer />} label="Horas LDC" value={hoursLabel(totals.ldcMinutes)} hint="Atividades aprovadas" />
          <StatCard icon={<BookOpen />} label="Publicações" value={String(totals.publications)} hint="Total no mês" />
          <StatCard icon={<UsersRound />} label="Estudos" value={String(exactStudies)} hint="Pessoas acompanhadas" />
        </section>
        <section className="panel comparison-panel">
          <div className="panel-heading comparison-heading">
            <div><span className="card-label">Comparação entre meses</span><h2>{MONTHS[period.getMonth()]} {period.getFullYear()} x {MONTHS[monthRequestDate(period, -1).getMonth()]} {monthRequestDate(period, -1).getFullYear()}</h2></div>
            <Gauge size={22} />
          </div>
          <div className="comparison-grid">
            <ComparisonCard label="Horas" current={totals.minutes} previous={previousTotals.minutes} formatter={hoursLabel} />
            <ComparisonCard label="Publicações" current={totals.publications} previous={previousTotals.publications} />
            <ComparisonCard label="Sessões de estudo" current={totals.studies} previous={previousTotals.studies} />
          </div>
        </section>

        <AnnualPanel records={yearRecords} goalHours={user.annualGoalHours} year={period.getFullYear()} />

        <section className="content-grid" id="relatorios">
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div><span className="card-label">Distribuição semanal</span><h2>Ritmo por dia da semana</h2></div>
              <Gauge size={22} />
            </div>
            <div className="bar-chart month-transition" key={`chart-${period.getFullYear()}-${period.getMonth()}`} aria-label="Horas por dia da semana">
              {weekly.map((minutes, index) => (
                <div className="bar-column" key={DAY_LABELS[index]} aria-label={`${DAY_LABELS[index]}: ${hoursLabel(minutes)}`}>
                  <span className="bar-value">{minutes ? (minutes / 60).toFixed(minutes % 60 ? 1 : 0).replace(".", ",") + "h" : ""}</span>
                  <div className="bar-track"><span style={{ height: `${Math.max(minutes ? 12 : 2, (minutes / weeklyMax) * 100)}%`, animationDelay: `${index * 65}ms` }} /></div>
                  <small>{DAY_LABELS[index]}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel report-panel" data-tour="pdf">
            <div className="report-illustration"><FileDown size={34} /></div>
            <div>
              <span className="card-label">Fechamento do mês</span>
              <h2>Seu relatório está pronto</h2>
              <p>Baixe um PDF elegante para arquivar ou compartilhar, ou exporte os dados em planilha.</p>
            </div>
            <div className="report-actions">
              <button className="button primary" onClick={() => void shareReport()}><Share2 size={18} /> Compartilhar</button>
              <button className="button whatsapp" onClick={shareWhatsApp}><MessageCircle size={18} /> WhatsApp</button>
              <button className="button secondary" onClick={() => void downloadPdf()}><FileDown size={18} /> PDF</button>
              <button className="button secondary" onClick={() => exportCsv()}><Download size={18} /> CSV</button>
            </div>
          </article>
        </section>
        </>}

        {activeView === "history" && <HistoryPanel
          records={yearRecords}
          studies={studies}
          year={period.getFullYear()}
          onYearChange={(year) => setPeriod(new Date(year, period.getMonth(), 1))}
          onEdit={(record: HistoryRecord) => {
            setPeriod(new Date(record.year, record.month - 1, 1));
            setEditing(record as RecordEntry);
            setRecordOpen(true);
          }}
          onDelete={(record: HistoryRecord) => void deleteRecord(record as RecordEntry)}
          onExport={(entries) => exportCsv(entries as RecordEntry[], `historico-${period.getFullYear()}`)}
        />}

        {activeView === "studies" && <section className="studies-workspace" aria-labelledby="studies-workspace-title">
          <header className="workspace-heading">
            <div><span className="card-label">Estudantes</span><h1 id="studies-workspace-title">Acompanhamentos em um só lugar</h1><p>Veja a agenda, o progresso e quem precisa de atenção. O histórico de horas continua separado.</p></div>
            <button type="button" className="button primary" onClick={() => setStudiesOpen(true)}><Plus size={18} /> Cadastrar ou editar</button>
          </header>
          <section className="studies-overview-summary" aria-label="Resumo dos acompanhamentos">
            <article><BookHeart size={21} /><span><small>Ativos</small><strong>{studies.filter((study) => study.active).length}</strong></span></article>
            <article><TriangleAlert size={21} /><span><small>Precisam de atenção</small><strong>{attentionStudies.length}</strong></span></article>
            <article><CalendarDays size={21} /><span><small>Com próximo encontro</small><strong>{studies.filter((study) => study.active && study.nextMeetingOn).length}</strong></span></article>
          </section>
          {attentionStudies.length > 0 && <section className="students-priority panel"><div><span><TriangleAlert size={20} /></span><div><small>Prioridade</small><h2>Retome estes acompanhamentos</h2></div></div><div>{attentionStudies.map((study) => <a href={`/estudantes/${study.id}`} key={study.id}><span><strong>{study.name}</strong><small>{daysSinceDate(study.lastContactOn || study.startedOn)} dias sem presença registrada</small></span><ChevronRight size={17} /></a>)}</div></section>}
          {studies.length ? <div className="studies-overview-grid">{studies.map((study) => <article className={`study-overview-card ${study.active ? "" : "inactive"}`} key={study.id}>
            <header><span className="study-overview-avatar">{study.name.charAt(0).toUpperCase()}</span><div><strong>{study.name}</strong><small>{study.active ? "Acompanhamento ativo" : "Acompanhamento encerrado"}</small></div><span className={`study-state ${study.active ? "active" : ""}`}>{study.active ? "Ativo" : "Encerrado"}</span></header>
            <div className="study-overview-progress"><span><small>Progresso</small><strong>{study.progress}%</strong></span><div><span style={{ width: `${Math.min(100, study.progress)}%` }} /></div><p>{study.currentSubject || "Nenhum assunto registrado."}</p></div>
            <dl><div><dt>Agenda</dt><dd>{studyScheduleLabel(study) || "A combinar"}</dd></div><div><dt>Próximo encontro</dt><dd>{study.nextMeetingOn ? fullDate(study.nextMeetingOn) : "Não definido"}{study.preferredTime ? ` às ${study.preferredTime}` : ""}</dd></div><div><dt>Último contato</dt><dd>{study.lastContactOn ? fullDate(study.lastContactOn) : "Ainda não registrado"}</dd></div></dl>
            <footer><a className="button secondary" href={`/estudantes/${study.id}`}><BookOpen size={16} /> Abrir ficha e histórico</a><button type="button" className="button ghost" onClick={() => setStudiesOpen(true)}><Pencil size={16} /> Gerenciar</button></footer>
          </article>)}</div> : <div className="history-empty panel"><BookHeart size={32} /><h2>Nenhum estudante cadastrado</h2><p>Cadastre o primeiro acompanhamento para organizar agenda, progresso e lembretes.</p><button type="button" className="button primary" onClick={() => setStudiesOpen(true)}><Plus size={18} /> Cadastrar estudante</button></div>}
        </section>}
      </main>

      <Footer />
      <nav className="mobile-bottom-nav" aria-label="Navegação principal">
        <button type="button" className={activeView === "home" ? "active" : ""} aria-current={activeView === "home" ? "page" : undefined} onClick={() => navigateTo("home")}><Home size={21} /><span>Início</span></button>
        <button type="button" className={activeView === "history" ? "active" : ""} aria-current={activeView === "history" ? "page" : undefined} onClick={() => navigateTo("history")}><CalendarDays size={21} /><span>Histórico</span></button>
        <button type="button" className="bottom-register" onClick={() => void openTodayRecord()}><span><Plus size={23} /></span><small>Registrar</small></button>
        <button type="button" className={activeView === "studies" ? "active" : ""} aria-current={activeView === "studies" ? "page" : undefined} onClick={() => navigateTo("studies")}><BookHeart size={21} /><span>Estudantes</span></button>
        <button type="button" className={activeView === "reports" ? "active" : ""} aria-current={activeView === "reports" ? "page" : undefined} onClick={() => navigateTo("reports")}><FileDown size={21} /><span>Relatórios</span></button>
      </nav>
      {recordOpen && (
        <RecordModal
          record={editing}
          availableStudies={studies}
          initialDate={recordInitialDate ?? (period.getMonth() === new Date().getMonth() && period.getFullYear() === new Date().getFullYear() ? today() : `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, "0")}-01`)}
          draftKey={`hora-a-hora-draft-${user.id}`}
          busy={busy}
          onClose={() => { setRecordOpen(false); setRecordInitialDate(null); }}
          onSave={async (input) => {
            if (await persistRecord(editing, input)) {
              setRecordOpen(false);
              setRecordInitialDate(null);
            }
          }}
        />
      )}
      {quickDate && (
        <QuickRecordModal
          date={quickDate}
          record={quickRecord}
          availableStudies={studies}
          busy={busy}
          onClose={() => setQuickDate(null)}
          onDetails={() => {
            const date = quickDate;
            setQuickDate(null);
            if (quickRecord) {
              setEditing(quickRecord);
              setRecordInitialDate(null);
              setRecordOpen(true);
            } else {
              openNewRecord(date);
            }
          }}
          onSave={async (input) => { if (await persistRecord(quickRecord, input)) setQuickDate(null); }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          user={user}
          busy={busy}
          reminders={reminders}
          accessibility={accessibility}
          onClose={() => setSettingsOpen(false)}
          onRemindersChange={changeReminders}
          onAccessibilityChange={changeAccessibility}
          onStartTour={startTour}
          onSave={async (data) => {
            setBusy(true);
            try {
              const result = await api<{ user: User }>("/api/account", { method: "PATCH", body: JSON.stringify(data) });
              setUser(result.user);
              window.localStorage.setItem(cachedUserKey(), JSON.stringify(result.user));
              setSettingsOpen(false);
              notify("Perfil atualizado.");
            } catch (error) { notify(error instanceof Error ? error.message : "Não foi possível salvar."); }
            finally { setBusy(false); }
          }}
        />
      )}
      {studiesOpen && (
        <StudiesModal
          studies={studies}
          busy={busy}
          onClose={() => setStudiesOpen(false)}
          onCreate={createStudy}
          onUpdate={updateStudy}
          onDelete={deleteStudy}
        />
      )}
      {adminOpen && <AdminPanel currentUser={user} onClose={() => setAdminOpen(false)} notify={notify} />}
      {tourStep !== null && <TourOverlay step={tourStep} onNext={() => tourStep >= 3 ? finishTour() : setTourStep(tourStep + 1)} onSkip={finishTour} />}
      {message && <Toast message={message} />}
    </div>
  );
}

function Toast({ message }: { message: ToastMessage }) {
  const Icon = message.tone === "success" ? Check : message.tone === "error" || message.tone === "warning" ? TriangleAlert : CircleHelp;
  return (
    <div className={`toast toast-${message.tone}`} role={message.tone === "error" ? "alert" : "status"} aria-live={message.tone === "error" ? "assertive" : "polite"}>
      <span className="toast-icon"><Icon size={17} /></span><span>{message.text}</span>{message.action && <button type="button" className="toast-action" onClick={message.action.onClick}>{message.action.label}</button>}
    </div>
  );
}

function LoadingScreen() {
  return <div className="loading-screen"><Brand /><div className="spinner" /><p>Preparando seu painel…</p></div>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <span className="brand-mark"><Clock3 size={compact ? 22 : 28} strokeWidth={2.3} /></span>
      <span><strong>Hora a Hora</strong>{!compact && <small>Meu relatório de serviço</small>}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer>
      <p>“Usando o meu tempo do melhor modo possível.” <span>— Efésios 5:16</span></p>
      <small>Hora a Hora · seus registros protegidos.</small>
    </footer>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <span className="card-label">{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function ComparisonCard({ label, current, previous, formatter = String }: { label: string; current: number; previous: number; formatter?: (value: number) => string }) {
  const delta = current - previous;
  const percentage = previous > 0 ? Math.round((Math.abs(delta) / previous) * 100) : null;
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const description = previous === 0
    ? current > 0 ? "Primeiros dados para comparar" : "Sem dados nos dois meses"
    : delta === 0 ? "Igual ao mês anterior" : `${percentage}% ${delta > 0 ? "a mais" : "a menos"}`;
  return (
    <article className={`comparison-card ${tone}`}>
      <div><span className="card-label">{label}</span><strong>{formatter(current)}</strong><small>Anterior: {formatter(previous)}</small></div>
      <span className="comparison-change">
        {delta > 0 ? <ArrowUpRight size={17} /> : delta < 0 ? <ArrowDownRight size={17} /> : <Minus size={17} />}
        <span><strong>{delta === 0 ? "Sem mudança" : `${delta > 0 ? "+" : "−"}${formatter(Math.abs(delta))}`}</strong><small>{description}</small></span>
      </span>
    </article>
  );
}

function ThemePicker({ theme, open, onToggle, onSelect, floating = false }: {
  theme: ThemeId;
  open: boolean;
  onToggle: () => void;
  onSelect: (theme: ThemeId) => void;
  floating?: boolean;
}) {
  const selected = THEMES.find((item) => item.id === theme) ?? THEMES[0];
  return (
    <div className={`theme-control ${floating ? "theme-control-floating" : ""}`}>
      <button
        className={floating ? "theme-floating-button" : "header-link"}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Palette size={17} />
        <span>Tema</span>
        <i className="current-theme-dot" style={{ backgroundColor: selected.color }} />
      </button>
      {open && (
        <div className="theme-menu" role="dialog" aria-label="Escolher tema de cores">
          <div className="theme-menu-heading">
            <div><strong>Escolha seu tema</strong><small>A preferência fica salva neste aparelho.</small></div>
            <button type="button" aria-label="Fechar temas" onClick={onToggle}><X size={17} /></button>
          </div>
          <div className="theme-options">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === theme ? "selected" : ""}
                aria-pressed={item.id === theme}
                onClick={() => onSelect(item.id)}
              >
                <span className={`theme-swatch theme-${item.id}`}>
                  <i style={{ backgroundColor: item.color }} />
                </span>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                {item.id === theme && <Check size={17} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AuthScreen({ resetToken, onAuthenticated, notify, theme, themeOpen, onToggleTheme, onSelectTheme }: {
  resetToken?: string;
  onAuthenticated: (user: User) => void;
  notify: (text: string) => void;
  theme: ThemeId;
  themeOpen: boolean;
  onToggleTheme: () => void;
  onSelectTheme: (theme: ThemeId) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(resetToken ? "reset" : "login");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function changeMode(next: "login" | "register" | "forgot") {
    setMode(next);
    setSent(false);
    setFieldErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors: AuthFieldErrors = {};
    if (mode === "register" && form.name.trim().length < 2) errors.name = "Informe seu nome.";
    if ((mode === "login" || mode === "register" || mode === "forgot") && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      errors.email = "Informe um e-mail válido.";
    }
    if (mode !== "forgot" && !form.password) errors.password = "Informe sua senha.";
    if (mode === "register" || mode === "reset") {
      if (form.password.length < 8) errors.password = "A senha precisa ter pelo menos 8 caracteres.";
      else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errors.password = "A senha precisa conter letras e números.";
      if (form.password !== form.confirm) errors.confirm = "As senhas não coincidem.";
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === "forgot") {
        const result = await api<{ message: string }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email: form.email }) });
        setSent(true);
        notify(result.message);
      } else if (mode === "reset") {
        const result = await api<{ message: string }>("/api/auth/reset", { method: "POST", body: JSON.stringify({ token: resetToken, password: form.password }) });
        window.history.replaceState({}, "", "/");
        setMode("login");
        setForm({ ...form, password: "", confirm: "" });
        setFieldErrors({});
        notify(result.message);
      } else {
        const result = await api<{ user: User }>(`/api/auth/${mode}`, {
          method: "POST",
          body: JSON.stringify(form),
        });
        onAuthenticated(result.user);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível continuar.";
      if (/e-mail ou senha/i.test(message)) setFieldErrors({ password: message });
      else if (/e-?mail/i.test(message)) setFieldErrors({ email: message });
      else if (/senha/i.test(message)) setFieldErrors({ password: message });
      else if (/nome/i.test(message)) setFieldErrors({ name: message });
      else setFieldErrors({ form: message });
    } finally { setBusy(false); }
  }

  const titles = {
    login: ["Bem-vindo de volta", "Entre para continuar acompanhando suas horas."],
    register: ["Crie sua conta", "Seus registros ficarão privados e separados dos demais."],
    forgot: ["Recupere sua senha", "Enviaremos um link seguro para o seu e-mail."],
    reset: ["Crie uma nova senha", "Escolha uma senha com pelo menos 8 caracteres, letras e números."],
  };

  return (
    <main className="auth-shell">
      <ThemePicker theme={theme} open={themeOpen} onToggle={onToggleTheme} onSelect={onSelectTheme} floating />
      <section className="auth-story">
        <Brand />
        <div className="story-copy">
          <span className="story-badge"><ShieldCheck size={16} /> Simples, privado e seguro</span>
          <h1>Cuide bem do seu tempo. Nós organizamos o restante.</h1>
          <p>Registre horas, acompanhe sua meta e gere relatórios mensais bonitos em poucos cliques.</p>
          <div className="story-features">
            <span><Check size={17} /> Metas mensais de até 200 horas</span>
            <span><Check size={17} /> Relatório mensal em PDF</span>
            <span><Check size={17} /> Instalável no Android</span>
          </div>
        </div>
        <blockquote>“Usando o meu tempo do melhor modo possível.”<small>— Efésios 5:16</small></blockquote>
      </section>
      <section className="auth-area">
        <div className="auth-card">
          <div className="auth-mobile-brand"><Brand compact /></div>
          <span className="eyebrow"><Sparkles size={14} /> Hora a Hora</span>
          <h2>{titles[mode][0]}</h2>
          <p>{titles[mode][1]}</p>

          {sent && mode === "forgot" ? (
            <div className="sent-state">
              <span><Mail size={28} /></span><h3>Confira sua caixa de entrada</h3>
              <p>Se o e-mail estiver cadastrado, você receberá o link em instantes. Confira também o spam.</p>
              <button className="button secondary full" onClick={() => changeMode("login")}>Voltar para o login</button>
            </div>
          ) : (
            <form onSubmit={submit} className="auth-form" noValidate>
              {mode === "register" && (
                <label className={fieldErrors.name ? "field-invalid" : ""}>Seu nome<input required autoComplete="name" aria-invalid={Boolean(fieldErrors.name)} value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Como podemos chamar você?" />{fieldErrors.name && <small className="field-error" role="alert">{fieldErrors.name}</small>}</label>
              )}
              {(mode === "login" || mode === "register" || mode === "forgot") && (
                <label className={fieldErrors.email ? "field-invalid" : ""}>E-mail<div className="input-with-icon"><Mail size={18} /><input required type="email" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="voce@exemplo.com" /></div>{fieldErrors.email && <small className="field-error" role="alert">{fieldErrors.email}</small>}</label>
              )}
              {mode !== "forgot" && (
                <label className={fieldErrors.password ? "field-invalid" : ""}>Senha<div className="password-field"><input required type={showPassword ? "text" : "password"} minLength={mode === "login" ? undefined : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} aria-invalid={Boolean(fieldErrors.password)} value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder={mode === "login" ? "Digite sua senha" : "Mínimo de 8 caracteres"} /><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{fieldErrors.password && <small className="field-error" role="alert">{fieldErrors.password}</small>}</label>
              )}
              {(mode === "register" || mode === "reset") && (
                <label className={fieldErrors.confirm ? "field-invalid" : ""}>Confirme a senha<div className="password-field"><input required type={showPassword ? "text" : "password"} minLength={8} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirm)} value={form.confirm} onChange={(event) => updateField("confirm", event.target.value)} placeholder="Digite a senha novamente" /><button type="button" aria-label={showPassword ? "Ocultar confirmação da senha" : "Mostrar confirmação da senha"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{fieldErrors.confirm && <small className="field-error" role="alert">{fieldErrors.confirm}</small>}</label>
              )}
              {fieldErrors.form && <div className="form-error" role="alert">{fieldErrors.form}</div>}
              {mode === "login" && <button type="button" className="text-button forgot-link" onClick={() => changeMode("forgot")}>Esqueci minha senha</button>}
              <button className="button primary full auth-submit" disabled={busy}>{busy ? <><span className="mini-spinner" /> Aguarde…</> : mode === "login" ? "Entrar" : mode === "register" ? "Criar minha conta" : mode === "forgot" ? "Enviar link de recuperação" : "Salvar nova senha"}</button>
            </form>
          )}
          {!sent && mode !== "reset" && (
            <div className="auth-switch">
              {mode === "login" ? <>Ainda não tem conta? <button type="button" onClick={() => changeMode("register")}>Criar conta</button></> : <>Já tem uma conta? <button type="button" onClick={() => changeMode("login")}>Entrar</button></>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Modal({ title, subtitle, onClose, children, wide = false, className = "" }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; className?: string }) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const focusInitial = window.setTimeout(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>("[autofocus]");
      (preferred ?? dialogRef.current?.querySelector<HTMLElement>(focusableSelector))?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusInitial);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className={`modal ${wide ? "modal-wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={21} /></button></div>
        {children}
      </section>
    </div>
  );
}

function DurationShortcuts({ onAdd }: { onAdd: (minutes: number) => void }) {
  return (
    <div className="minute-shortcuts" aria-label="Atalhos para adicionar tempo">
      {DURATION_SHORTCUTS.map((shortcut) => (
        <button type="button" key={shortcut.minutes} onClick={() => onAdd(shortcut.minutes)}>{shortcut.label}</button>
      ))}
    </div>
  );
}

function QuickDurationCard({ type, hours, minutes, hoursError, minutesError, autoFocus = false, onHoursChange, onMinutesChange, onAdd }: {
  type: "service" | "ldc";
  hours: string;
  minutes: string;
  hoursError?: string;
  minutesError?: string;
  autoFocus?: boolean;
  onHoursChange: (value: string) => void;
  onMinutesChange: (value: string) => void;
  onAdd: (minutes: number) => void;
}) {
  const isLdc = type === "ldc";
  const clearInitialZero = (value: string, change: (next: string) => void) => { if (value === "0") change(""); };
  const restoreEmpty = (value: string, change: (next: string) => void) => { if (!value.trim()) change("0"); };
  return (
    <section className={`quick-duration-card ${isLdc ? "ldc-card" : "service-card"} ${hoursError || minutesError ? "field-invalid" : ""}`}>
      <header>
        <span>{isLdc ? <Timer size={19} /> : <Clock3 size={19} />}</span>
        <div><strong>{isLdc ? "Tempo LDC" : "Tempo de serviço"}</strong><small>{isLdc ? "Atividade aprovada · opcional" : "Horas principais do dia"}</small></div>
      </header>
      <div className="quick-duration-fields">
        <label><span>Horas</span><input autoFocus={autoFocus} required type="number" min="0" max={MAX_RECORD_HOURS} step="1" inputMode="numeric" aria-invalid={Boolean(hoursError)} value={hours} onFocus={() => clearInitialZero(hours, onHoursChange)} onBlur={() => restoreEmpty(hours, onHoursChange)} onChange={(event) => onHoursChange(event.target.value)} />{hoursError && <small className="field-error" role="alert">{hoursError}</small>}</label>
        <span className="quick-duration-separator" aria-hidden="true">h</span>
        <label><span>Minutos</span><input required type="number" min="0" max="59" step="1" inputMode="numeric" aria-invalid={Boolean(minutesError)} value={minutes} onFocus={() => clearInitialZero(minutes, onMinutesChange)} onBlur={() => restoreEmpty(minutes, onMinutesChange)} onChange={(event) => onMinutesChange(event.target.value)} />{minutesError && <small className="field-error" role="alert">{minutesError}</small>}</label>
        <span className="quick-duration-suffix" aria-hidden="true">min</span>
      </div>
      <DurationShortcuts onAdd={onAdd} />
    </section>
  );
}

function RecordStudySelector({ availableStudies, selectedIds, onChange, compact = false }: {
  availableStudies: StudyEntry[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  compact?: boolean;
}) {
  const choices = availableStudies.filter((study) => study.active || selectedIds.includes(study.id));
  return (
    <fieldset className={`record-study-selector ${compact ? "compact" : ""}`}>
      <legend>Estudantes acompanhados <span className="optional">opcional</span></legend>
      {choices.length ? (
        <div className="record-study-options">
          {choices.map((study) => {
            const selected = selectedIds.includes(study.id);
            return (
              <label className={selected ? "selected" : ""} key={study.id}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onChange(selected ? selectedIds.filter((id) => id !== study.id) : [...selectedIds, study.id])}
                />
                <span><strong>{study.name}</strong>{studyScheduleLabel(study) && <small>{studyScheduleLabel(study)}</small>}</span>
                {selected && <Check size={15} />}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="record-study-empty">Nenhum estudante cadastrado. Use “Gerenciar estudos” no painel para criar a lista.</p>
      )}
      {!compact && <small className="field-hint">A seleção fica vinculada a esta data e aparece no histórico, PDF e CSV.</small>}
    </fieldset>
  );
}

function RecordModal({ record, availableStudies, initialDate, draftKey, busy, onClose, onSave }: {
  record: RecordEntry | null;
  availableStudies: StudyEntry[];
  initialDate: string;
  draftKey: string;
  busy: boolean;
  onClose: () => void;
  onSave: (data: RecordFormInput) => void;
}) {
  const [draftRestored] = useState(() => !record && Boolean(window.localStorage.getItem(draftKey)));
  const [fieldErrors, setFieldErrors] = useState<RecordFieldErrors>({});
  const [form, setForm] = useState<RecordDraft>(() => {
    const duration = record ? durationParts(record.minutes) : { hours: "0", minutes: "0" };
    const ldcDuration = record ? durationParts(record.ldcMinutes) : { hours: "0", minutes: "0" };
    const initial = {
      date: record?.date ?? initialDate,
      ...duration,
      ldcHours: ldcDuration.hours,
      ldcMinutes: ldcDuration.minutes,
      publications: String(record?.publications ?? 0),
      studies: String(record?.studies ?? 0),
      studyIds: record?.studyIds ?? [],
      notes: record?.notes ?? "",
    };
    if (record) return initial;
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (!saved) return initial;
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return initial;
      const restored: RecordDraft = {
        date: typeof parsed.date === "string" ? parsed.date : initial.date,
        hours: typeof parsed.hours === "string" || typeof parsed.hours === "number" ? String(parsed.hours) : initial.hours,
        minutes: typeof parsed.minutes === "string" || typeof parsed.minutes === "number" ? String(parsed.minutes) : initial.minutes,
        ldcHours: typeof parsed.ldcHours === "string" || typeof parsed.ldcHours === "number" ? String(parsed.ldcHours) : initial.ldcHours,
        ldcMinutes: typeof parsed.ldcMinutes === "string" || typeof parsed.ldcMinutes === "number" ? String(parsed.ldcMinutes) : initial.ldcMinutes,
        publications: typeof parsed.publications === "string" || typeof parsed.publications === "number" ? String(parsed.publications) : initial.publications,
        studies: typeof parsed.studies === "string" || typeof parsed.studies === "number" ? String(parsed.studies) : initial.studies,
        studyIds: Array.isArray(parsed.studyIds) ? parsed.studyIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0) : initial.studyIds,
        notes: typeof parsed.notes === "string" ? parsed.notes : initial.notes,
      };
      if (!("minutes" in parsed)) {
        const oldHours = Number(parsed.hours);
        if (Number.isFinite(oldHours)) {
          const converted = durationParts(Math.max(0, Math.round(oldHours * 60)));
          restored.hours = converted.hours;
          restored.minutes = converted.minutes;
        }
      }
      return restored;
    } catch { return initial; }
  });

  useEffect(() => {
    if (!record) window.localStorage.setItem(draftKey, JSON.stringify(form));
  }, [draftKey, form, record]);

  function updateRecordField(field: Exclude<keyof RecordDraft, "studyIds">, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function applyDurationShortcut(amount: number) {
    setForm((current) => ({ ...current, ...addDuration(current.hours, current.minutes, amount) }));
    setFieldErrors((current) => ({ ...current, hours: undefined, minutes: undefined }));
  }

  function applyLdcDurationShortcut(amount: number) {
    const next = addDuration(form.ldcHours, form.ldcMinutes, amount);
    setForm((current) => ({ ...current, ldcHours: next.hours, ldcMinutes: next.minutes }));
    setFieldErrors((current) => ({ ...current, ldcHours: undefined, ldcMinutes: undefined }));
  }

  function submitRecord(event: FormEvent) {
    event.preventDefault();
    const errors: RecordFieldErrors = validateDurationFields(form.hours, form.minutes);
    const ldcErrors = validateDurationFields(form.ldcHours, form.ldcMinutes);
    if (ldcErrors.hours) errors.ldcHours = ldcErrors.hours;
    if (ldcErrors.minutes) errors.ldcMinutes = ldcErrors.minutes;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.date = "Informe uma data válida.";
    const publications = Number(form.publications);
    const studies = Number(form.studies);
    if (!Number.isInteger(publications) || publications < 0 || publications > 9999) errors.publications = "Digite um valor entre 0 e 9.999.";
    if (!Number.isInteger(studies) || studies < 0 || studies > 9999) errors.studies = "Digite um valor entre 0 e 9.999.";
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    onSave({ date: form.date, hours: Number(form.hours), minutes: Number(form.minutes), ldcHours: Number(form.ldcHours), ldcMinutes: Number(form.ldcMinutes), publications, studies, studyIds: form.studyIds, notes: form.notes });
  }

  return (
    <Modal title={record ? "Editar registro" : "Novo registro"} subtitle="Preencha os dados do seu dia." onClose={onClose}>
      <form className="modal-form" onSubmit={submitRecord} noValidate>
        {!record && <div className={`draft-status ${draftRestored ? "restored" : ""}`}><Save size={16} /><span><strong>{draftRestored ? "Rascunho recuperado" : "Salvamento automático ativo"}</strong><small>Se fechar esta tela, o preenchimento continuará salvo neste aparelho.</small></span></div>}
        <label className={fieldErrors.date ? "field-invalid" : ""}>Data<input required type="date" aria-invalid={Boolean(fieldErrors.date)} value={form.date} onChange={(event) => updateRecordField("date", event.target.value)} />{fieldErrors.date && <small className="field-error" role="alert">{fieldErrors.date}</small>}</label>
        <fieldset className={`duration-group ${fieldErrors.hours || fieldErrors.minutes ? "field-invalid" : ""}`}><legend>Tempo de serviço</legend><div className="duration-fields"><label>Horas<input autoFocus required type="number" min="0" max={MAX_RECORD_HOURS} step="1" inputMode="numeric" aria-invalid={Boolean(fieldErrors.hours)} value={form.hours} onChange={(event) => updateRecordField("hours", event.target.value)} placeholder="0" />{fieldErrors.hours && <small className="field-error" role="alert">{fieldErrors.hours}</small>}</label><span className="duration-separator" aria-hidden="true">:</span><label>Minutos<input required type="number" min="0" max="59" step="1" inputMode="numeric" aria-invalid={Boolean(fieldErrors.minutes)} value={form.minutes} onChange={(event) => updateRecordField("minutes", event.target.value)} placeholder="0" />{fieldErrors.minutes && <small className="field-error" role="alert">{fieldErrors.minutes}</small>}</label></div><DurationShortcuts onAdd={applyDurationShortcut} /><small className="field-hint">Aceita até 200 horas. Exemplo: para uma hora e meia, digite 1 em horas e 30 em minutos.</small></fieldset>
        <fieldset className={`duration-group ldc-duration ${fieldErrors.ldcHours || fieldErrors.ldcMinutes ? "field-invalid" : ""}`}><legend>Tempo LDC <span className="optional">opcional</span></legend><div className="duration-fields"><label>Horas<input required type="number" min="0" max={MAX_RECORD_HOURS} step="1" inputMode="numeric" aria-invalid={Boolean(fieldErrors.ldcHours)} value={form.ldcHours} onChange={(event) => updateRecordField("ldcHours", event.target.value)} placeholder="0" />{fieldErrors.ldcHours && <small className="field-error" role="alert">{fieldErrors.ldcHours}</small>}</label><span className="duration-separator" aria-hidden="true">:</span><label>Minutos<input required type="number" min="0" max="59" step="1" inputMode="numeric" aria-invalid={Boolean(fieldErrors.ldcMinutes)} value={form.ldcMinutes} onChange={(event) => updateRecordField("ldcMinutes", event.target.value)} placeholder="0" />{fieldErrors.ldcMinutes && <small className="field-error" role="alert">{fieldErrors.ldcMinutes}</small>}</label></div><DurationShortcuts onAdd={applyLdcDurationShortcut} /><small className="field-hint">Aceita até 200 horas para atividades aprovadas que entram separadamente no relatório.</small></fieldset>
        <div className="two-columns">
          <label className={fieldErrors.publications ? "field-invalid" : ""}>Publicações<input type="number" min="0" max="9999" aria-invalid={Boolean(fieldErrors.publications)} value={form.publications} onChange={(event) => updateRecordField("publications", event.target.value)} />{fieldErrors.publications && <small className="field-error" role="alert">{fieldErrors.publications}</small>}</label>
          <label className={fieldErrors.studies ? "field-invalid" : ""}>Sessões de estudo<input type="number" min="0" max="9999" aria-invalid={Boolean(fieldErrors.studies)} value={form.studies} onChange={(event) => updateRecordField("studies", event.target.value)} />{fieldErrors.studies && <small className="field-error" role="alert">{fieldErrors.studies}</small>}</label>
        </div>
        <RecordStudySelector availableStudies={availableStudies} selectedIds={form.studyIds} onChange={(studyIds) => setForm((current) => ({ ...current, studyIds }))} />
        <label>Anotações <span className="optional">opcional</span><textarea maxLength={1000} rows={4} value={form.notes} onChange={(event) => updateRecordField("notes", event.target.value)} placeholder="Visitas, experiências ou observações do dia…" /></label>
        <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar registro"}</button></div>
      </form>
    </Modal>
  );
}

function QuickRecordModal({ date, record, availableStudies, busy, onClose, onDetails, onSave }: {
  date: string;
  record: RecordEntry | null;
  availableStudies: StudyEntry[];
  busy: boolean;
  onClose: () => void;
  onDetails: () => void;
  onSave: (data: RecordFormInput) => Promise<void>;
}) {
  const initialDuration = durationParts(record?.minutes ?? 0);
  const initialLdcDuration = durationParts(record?.ldcMinutes ?? 0);
  const [hours, setHours] = useState(initialDuration.hours);
  const [minutes, setMinutes] = useState(initialDuration.minutes);
  const [ldcHours, setLdcHours] = useState(initialLdcDuration.hours);
  const [ldcMinutes, setLdcMinutes] = useState(initialLdcDuration.minutes);
  const [studyIds, setStudyIds] = useState(record?.studyIds ?? []);
  const [fieldErrors, setFieldErrors] = useState<RecordFieldErrors>({});

  function applyDurationShortcut(amount: number) {
    const next = addDuration(hours, minutes, amount);
    setHours(next.hours);
    setMinutes(next.minutes);
    setFieldErrors({});
  }
  function applyLdcDurationShortcut(amount: number) {
    const next = addDuration(ldcHours, ldcMinutes, amount);
    setLdcHours(next.hours);
    setLdcMinutes(next.minutes);
    setFieldErrors({});
  }
  const quickTotalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0) + (Number(ldcHours) || 0) * 60 + (Number(ldcMinutes) || 0);
  return (
    <Modal title="Registro rápido" subtitle={fullDate(date)} onClose={onClose} className="quick-record-modal">
      <form className="modal-form quick-form" onSubmit={async (event) => {
        event.preventDefault();
        const normalizedHours = hours.trim() || "0";
        const normalizedMinutes = minutes.trim() || "0";
        const normalizedLdcHours = ldcHours.trim() || "0";
        const normalizedLdcMinutes = ldcMinutes.trim() || "0";
        const errors: RecordFieldErrors = validateDurationFields(normalizedHours, normalizedMinutes);
        const ldcErrors = validateDurationFields(normalizedLdcHours, normalizedLdcMinutes);
        if (ldcErrors.hours) errors.ldcHours = ldcErrors.hours;
        if (ldcErrors.minutes) errors.ldcMinutes = ldcErrors.minutes;
        if (Object.values(errors).some(Boolean)) {
          setFieldErrors(errors);
          return;
        }
        setFieldErrors({});
        await onSave({
          date,
          hours: Number(normalizedHours),
          minutes: Number(normalizedMinutes),
          ldcHours: Number(normalizedLdcHours),
          ldcMinutes: Number(normalizedLdcMinutes),
          publications: record?.publications ?? 0,
          studies: record?.studies ?? 0,
          studyIds,
          notes: record?.notes ?? "",
        });
      }} noValidate>
        <div className="quick-day-summary"><span><Zap size={21} /></span><div><strong>{record ? "Atualize as horas deste dia" : "Quantas horas você fez?"}</strong><small>Salve agora ou abra o formulário completo para incluir publicações, estudos e anotações.</small></div></div>
        <div className="quick-duration-grid">
          <QuickDurationCard type="service" autoFocus hours={hours} minutes={minutes} hoursError={fieldErrors.hours} minutesError={fieldErrors.minutes} onHoursChange={(value) => { setHours(value); setFieldErrors((current) => ({ ...current, hours: undefined })); }} onMinutesChange={(value) => { setMinutes(value); setFieldErrors((current) => ({ ...current, minutes: undefined })); }} onAdd={applyDurationShortcut} />
          <QuickDurationCard type="ldc" hours={ldcHours} minutes={ldcMinutes} hoursError={fieldErrors.ldcHours} minutesError={fieldErrors.ldcMinutes} onHoursChange={(value) => { setLdcHours(value); setFieldErrors((current) => ({ ...current, ldcHours: undefined })); }} onMinutesChange={(value) => { setLdcMinutes(value); setFieldErrors((current) => ({ ...current, ldcMinutes: undefined })); }} onAdd={applyLdcDurationShortcut} />
        </div>
        <div className="quick-total-preview"><span>Total informado</span><strong>{hoursLabel(quickTotalMinutes)}</strong><small>Serviço + LDC</small></div>
        <RecordStudySelector compact availableStudies={availableStudies} selectedIds={studyIds} onChange={setStudyIds} />
        <button type="button" className="quick-details-button" onClick={onDetails}><Pencil size={15} /> Preencher mais detalhes</button>
        <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando…" : record ? "Atualizar horas" : "Salvar rápido"}</button></div>
      </form>
    </Modal>
  );
}

function SettingsModal({ user, busy, reminders, accessibility, onClose, onSave, onRemindersChange, onAccessibilityChange, onStartTour }: {
  user: User;
  busy: boolean;
  reminders: ReminderPreferences;
  accessibility: AccessibilityPreferences;
  onClose: () => void;
  onSave: (data: { name: string; goalHours: number; annualGoalHours: number; roundingMode: RoundingMode }) => void;
  onRemindersChange: (preferences: ReminderPreferences) => void;
  onAccessibilityChange: (preferences: AccessibilityPreferences) => void;
  onStartTour: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [goal, setGoal] = useState(user.goalHours);
  const [annualGoal, setAnnualGoal] = useState(user.annualGoalHours);
  const [roundingMode, setRoundingMode] = useState<RoundingMode>(user.roundingMode);
  const changeGoal = (value: number) => setGoal(Math.min(MAX_MONTHLY_GOAL, Math.max(1, Math.round(value || 1))));
  const changeAnnualGoal = (value: number) => setAnnualGoal(Math.min(MAX_ANNUAL_GOAL, Math.max(1, Math.round(value || 1))));
  return (
    <Modal title="Minha conta" subtitle="Atualize seus dados e sua meta mensal." onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSave({ name, goalHours: goal, annualGoalHours: annualGoal, roundingMode }); }}>
        <div className="profile-chip"><span><CircleUserRound size={25} /></span><div><strong>{user.email}</strong><small>{user.trialExpiresAt ? `Conta de teste · expira ${dateTime(user.trialExpiresAt)}` : user.role === "admin" ? "Administrador" : "Conta pessoal"}</small></div></div>
        <label>Nome<input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="goal-setting"><span className="goal-setting-heading">Meta mensal <strong>{goal} horas</strong></span><span className="goal-number-control"><button type="button" aria-label="Diminuir meta mensal" onClick={() => changeGoal(goal - 1)}><Minus size={16} /></button><input aria-label="Digitar meta mensal em horas" type="number" inputMode="numeric" min="1" max={MAX_MONTHLY_GOAL} step="1" value={goal} onChange={(event) => changeGoal(Number(event.target.value))} /><span>horas</span><button type="button" aria-label="Aumentar meta mensal" onClick={() => changeGoal(goal + 1)}><Plus size={16} /></button></span><input className="range-input" aria-label="Ajustar meta mensal" type="range" min="1" max={MAX_MONTHLY_GOAL} value={goal} onChange={(event) => changeGoal(Number(event.target.value))} /><div className="range-labels"><span>1h</span><span>200h</span></div></label>
        <label className="goal-setting"><span className="goal-setting-heading">Meta anual <strong>{annualGoal} horas</strong></span><span className="goal-number-control"><button type="button" aria-label="Diminuir meta anual" onClick={() => changeAnnualGoal(annualGoal - 1)}><Minus size={16} /></button><input aria-label="Digitar meta anual em horas" type="number" inputMode="numeric" min="1" max={MAX_ANNUAL_GOAL} step="1" value={annualGoal} onChange={(event) => changeAnnualGoal(Number(event.target.value))} /><span>horas</span><button type="button" aria-label="Aumentar meta anual" onClick={() => changeAnnualGoal(annualGoal + 1)}><Plus size={16} /></button></span><input className="range-input" aria-label="Ajustar meta anual" type="range" min="1" max={MAX_ANNUAL_GOAL} step="1" value={annualGoal} onChange={(event) => changeAnnualGoal(Number(event.target.value))} /><div className="range-labels"><span>1h</span><span>2.400h</span></div></label>
        <label>Arredondamento no relatório<select value={roundingMode} onChange={(event) => setRoundingMode(event.target.value as RoundingMode)}><option value="none">Manter horas e minutos exatos</option><option value="nearest">Hora inteira mais próxima</option><option value="up">Sempre para cima</option><option value="down">Sempre para baixo</option></select><small className="field-hint">Os registros originais nunca são alterados; a regra vale somente no total do PDF.</small></label>
        <section className="preference-section">
          <div className="preference-heading"><span><Bell size={18} /></span><div><strong>Lembretes no celular</strong><small>Avise quando você ficar alguns dias sem preencher.</small></div><button type="button" role="switch" aria-checked={reminders.enabled} className={`switch-control ${reminders.enabled ? "active" : ""}`} onClick={() => onRemindersChange({ ...reminders, enabled: !reminders.enabled })}><i /></button></div>
          {reminders.enabled && <div className="preference-options"><small>Lembrar depois de:</small>{([2, 3, 5] as const).map((days) => <button type="button" key={days} className={reminders.days === days ? "selected" : ""} onClick={() => onRemindersChange({ ...reminders, days })}>{days} dias</button>)}</div>}
          <p className="preference-note">O navegador pedirá sua permissão. Em aparelhos compatíveis, o app também tenta verificar o lembrete em segundo plano.</p>
        </section>
        <section className="preference-section">
          <div className="preference-title"><Accessibility size={18} /><div><strong>Acessibilidade</strong><small>Ajustes visuais salvos neste aparelho.</small></div></div>
          <button type="button" className={`preference-toggle ${accessibility.largeText ? "selected" : ""}`} onClick={() => onAccessibilityChange({ ...accessibility, largeText: !accessibility.largeText })}><span>Aa</span><div><strong>Texto maior</strong><small>Aumenta textos, botões e informações importantes.</small></div><Check size={17} /></button>
          <button type="button" className={`preference-toggle ${accessibility.highContrast ? "selected" : ""}`} onClick={() => onAccessibilityChange({ ...accessibility, highContrast: !accessibility.highContrast })}><span className="contrast-icon" /><div><strong>Contraste extra</strong><small>Reforça bordas, fundos e legibilidade.</small></div><Check size={17} /></button>
        </section>
        <button type="button" className="tour-replay-button" onClick={onStartTour}><CircleHelp size={18} /><span><strong>Ver novamente o tour</strong><small>Aprenda onde registrar horas, alterar a meta e baixar o PDF.</small></span><ChevronRight size={18} /></button>
        <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</button></div>
      </form>
    </Modal>
  );
}

function TourOverlay({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {
  const steps = [
    { icon: <Sparkles size={28} />, title: "Bem-vindo ao Hora a Hora", text: "Em menos de um minuto você aprenderá a registrar suas horas, acompanhar a meta e baixar o relatório." },
    { icon: <CalendarDays size={28} />, title: "Registre pelo calendário", text: "Toque em um dia para salvar somente as horas. Se preferir, use “Preencher mais detalhes” para adicionar publicações, estudos e anotações." },
    { icon: <Gauge size={28} />, title: "Acompanhe e altere sua meta", text: "O cartão de progresso mostra quanto falta. Em “Minha conta”, você pode digitar o valor exato das metas mensal e anual." },
    { icon: <FileDown size={28} />, title: "Baixe seu relatório", text: "Na área “Fechamento do mês”, toque em “Baixar PDF”. O relatório usa o mês selecionado e o tema de cores atual." },
  ];
  const current = steps[step] ?? steps[0];
  return (
    <Modal title={`Tour rápido · ${step + 1} de ${steps.length}`} subtitle="Conheça os recursos principais." onClose={onSkip}>
      <div className="tour-content">
        <div className="tour-progress">{steps.map((_, index) => <i className={index <= step ? "active" : ""} key={index} />)}</div>
        <span className="tour-icon">{current.icon}</span>
        <h3>{current.title}</h3>
        <p>{current.text}</p>
        <div className="tour-actions"><button type="button" className="button ghost" onClick={onSkip}>Pular tour</button><button type="button" className="button primary" onClick={onNext}>{step === steps.length - 1 ? "Começar a usar" : "Próximo"}<ChevronRight size={18} /></button></div>
      </div>
    </Modal>
  );
}

function AdminPanel({ currentUser, onClose, notify }: { currentUser: User; onClose: () => void; notify: (text: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, admins: 0, trials: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuUser, setMenuUser] = useState<number | null>(null);
  const [trialForm, setTrialForm] = useState({ name: "Visitante de teste", email: "" });
  const [trialCreating, setTrialCreating] = useState(false);
  const [trialCredentials, setTrialCredentials] = useState<TrialCredentials | null>(null);
  const trialCreationLocked = useRef(false);

  const load = useCallback(async (term = "", page = 1) => {
    setLoading(true);
    try {
      const result = await api<{ users: AdminUser[]; summary: typeof summary; pagination: typeof pagination }>(`/api/admin/users?search=${encodeURIComponent(term)}&page=${page}&limit=50`);
      setUsers(result.users);
      setSummary(result.summary);
      setPagination(result.pagination);
    } catch (error) { notify(error instanceof Error ? error.message : "Não foi possível carregar os usuários."); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => {
    // O painel nasce com uma consulta administrativa e permanece fechado fora desta tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function update(target: AdminUser, changes: { active?: boolean; role?: "user" | "admin" }) {
    try {
      await api(`/api/admin/users/${target.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      setMenuUser(null);
      await load(search, pagination.page);
      notify("Usuário atualizado.");
    } catch (error) { notify(error instanceof Error ? error.message : "Não foi possível atualizar."); }
  }

  async function remove(target: AdminUser) {
    if (!window.confirm(`Excluir permanentemente a conta de ${target.name} e todos os seus registros?`)) return;
    try {
      await api(`/api/admin/users/${target.id}`, { method: "DELETE" });
      await load(search, pagination.page);
      notify("Conta e registros excluídos.");
    } catch (error) { notify(error instanceof Error ? error.message : "Não foi possível excluir."); }
  }

  async function createTrialAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trialCreationLocked.current) return;
    trialCreationLocked.current = true;
    setTrialCreating(true);
    try {
      const result = await api<{ credentials: TrialCredentials }>("/api/admin/trial-users", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(trialForm),
      });
      setTrialCredentials(result.credentials);
      setTrialForm({ name: "Visitante de teste", email: "" });
      await load(search, pagination.page);
      notify("Conta de teste criada por 24 horas.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível criar a conta de teste.");
    } finally {
      trialCreationLocked.current = false;
      setTrialCreating(false);
    }
  }

  async function copyTrialCredentials() {
    if (!trialCredentials) return;
    const content = [
      "Hora a Hora — acesso de teste por 24 horas",
      `E-mail: ${trialCredentials.email}`,
      `Senha: ${trialCredentials.password}`,
      `Válido até: ${dateTime(trialCredentials.expiresAt)}`,
    ].join("\n");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard indisponível");
      await navigator.clipboard.writeText(content);
      notify("Dados de acesso copiados.");
    } catch {
      window.prompt("Copie os dados de acesso:", content);
    }
  }

  function actionsFor(target: AdminUser) {
    const expired = target.type === "test" && target.trialExpired;
    return (
      <div className="action-menu">
        {!expired && <button type="button" onClick={() => update(target, { active: !target.active })}>{target.active ? "Desativar conta" : "Ativar conta"}</button>}
        {target.type !== "test" && !target.roleManagedByEnvironment && <button type="button" onClick={() => update(target, { role: target.type === "admin" ? "user" : "admin" })}>{target.type === "admin" ? "Remover admin" : "Tornar administrador"}</button>}
        {target.roleManagedByEnvironment && <small className="field-hint">Acesso definido por ADMIN_EMAILS</small>}
        <button type="button" className="menu-danger" onClick={() => remove(target)}><Trash2 size={15} /> Excluir conta</button>
      </div>
    );
  }

  return (
    <Modal title="Painel administrativo" subtitle="Gerencie acessos e acompanhe a base de usuários." onClose={onClose} wide>
      <div className="admin-body">
        <div className="admin-summary">
          <div><UsersRound size={21} /><span><strong>{summary.total}</strong><small>Usuários</small></span></div>
          <div><Check size={21} /><span><strong>{summary.active}</strong><small>Ativos</small></span></div>
          <div><ShieldCheck size={21} /><span><strong>{summary.admins}</strong><small>Administradores</small></span></div>
          <div><Timer size={21} /><span><strong>{summary.trials}</strong><small>Testes ativos</small></span></div>
        </div>
        {currentUser.canCreateTrials && <section className="admin-trial-panel">
          <div className="admin-trial-heading">
            <span><UserPlus size={22} /></span>
            <div><strong>Criar conta de teste</strong><small>O acesso expira automaticamente 24 horas após a criação.</small></div>
          </div>
          <form className="admin-trial-form" onSubmit={createTrialAccount}>
            <label>Nome<input required minLength={2} maxLength={80} value={trialForm.name} onChange={(event) => setTrialForm({ ...trialForm, name: event.target.value })} placeholder="Nome do visitante" /></label>
            <label>E-mail <span className="optional">(opcional)</span><input type="email" value={trialForm.email} onChange={(event) => setTrialForm({ ...trialForm, email: event.target.value })} placeholder="Deixe vazio para gerar" /></label>
            <button className="button primary" disabled={trialCreating}>{trialCreating ? <><span className="mini-spinner" /> Criando…</> : <><UserPlus size={17} /> Criar teste de 24h</>}</button>
          </form>
          {trialCredentials && (
            <div className="trial-credentials" role="status">
              <div className="trial-credentials-title"><span><Check size={17} /></span><div><strong>Acesso criado</strong><small>E-mail curto e senha de 8 caracteres. Copie agora, pois a senha não será exibida novamente.</small></div></div>
              <dl><div><dt>E-mail</dt><dd>{trialCredentials.email}</dd></div><div><dt>Senha</dt><dd>{trialCredentials.password}</dd></div><div><dt>Expira em</dt><dd>{dateTime(trialCredentials.expiresAt)}</dd></div></dl>
              <button type="button" className="button secondary" onClick={copyTrialCredentials}><Copy size={17} /> Copiar dados de acesso</button>
            </div>
          )}
        </section>}
        <form className="admin-search" onSubmit={(event) => { event.preventDefault(); void load(search, 1); }}>
          <Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" /><button className="button secondary">Buscar</button>
        </form>
        <div className="admin-user-results">
          {loading ? <div className="inline-loading"><span className="spinner" /> Carregando usuários…</div> : users.length ? (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Usuário</th><th>Tipo</th><th /></tr></thead>
                  <tbody>{users.map((target) => (
                    <tr key={target.id}>
                      <td><div className="user-cell"><span className="user-cell-avatar">{target.name.slice(0, 1).toUpperCase()}</span><span className="user-cell-copy"><strong>{target.name}{target.id === currentUser.id && " (você)"}</strong><small className="user-cell-email">{target.email}</small><small className="user-cell-last-access">{lastAccessLabel(target.lastAccessAt)}</small><small className="user-cell-created">Criado em {dateTime(target.createdAt)}</small>{target.trialCreatedByEmail && <small className="user-cell-creator">Criado por {target.trialCreatedByEmail}</small>}</span></div></td>
                      <td><span className={`account-type-pill ${target.type}`}>{accountTypeLabel(target)}</span></td>
                      <td className="admin-actions-cell"><button type="button" className="row-menu-button" aria-label="Ações do usuário" onClick={() => setMenuUser(menuUser === target.id ? null : target.id)}><MoreHorizontal size={19} /></button>
                        {menuUser === target.id && actionsFor(target)}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="admin-mobile-list">
                {users.map((target) => (
                  <article className="admin-user-card" key={target.id}>
                    <div className="admin-user-card-heading">
                      <div className="user-cell"><span className="user-cell-avatar">{target.name.slice(0, 1).toUpperCase()}</span><span className="user-cell-copy"><strong>{target.name}{target.id === currentUser.id && " (você)"}</strong><small className="user-cell-email">{target.email}</small><small className="user-cell-last-access">{lastAccessLabel(target.lastAccessAt)}</small><small className="user-cell-created">Criado em {dateTime(target.createdAt)}</small>{target.trialCreatedByEmail && <small className="user-cell-creator">Criado por {target.trialCreatedByEmail}</small>}</span></div>
                      <span className={`account-type-pill ${target.type}`}>{accountTypeLabel(target)}</span>
                    </div>
                    <div className="admin-user-card-actions">
                      <div className="mobile-action-menu-wrap">
                        <button type="button" className="row-menu-button" aria-label="Mais ações" onClick={() => setMenuUser(menuUser === target.id ? null : target.id)}><MoreHorizontal size={19} /></button>
                        {menuUser === target.id && actionsFor(target)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : <div className="empty-admin">Nenhum usuário encontrado.</div>}
        </div>
        {pagination.pages > 1 && (
          <nav className="admin-pagination" aria-label="Páginas de usuários">
            <button type="button" className="button secondary" disabled={loading || pagination.page <= 1} onClick={() => void load(search, pagination.page - 1)}><ChevronLeft size={17} /> Anterior</button>
            <span>Página {pagination.page} de {pagination.pages} · {pagination.total} resultado{pagination.total === 1 ? "" : "s"}</span>
            <button type="button" className="button secondary" disabled={loading || pagination.page >= pagination.pages} onClick={() => void load(search, pagination.page + 1)}>Próxima <ChevronRight size={17} /></button>
          </nav>
        )}
      </div>
    </Modal>
  );
}
