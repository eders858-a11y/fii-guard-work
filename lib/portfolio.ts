import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  exportBackup as shareBackup,
  importBackup as pickBackup,
} from "./backup";
import { syncMarket } from "./market-sync";
import { importB3Spreadsheet } from "./b3-import";
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const FERIADOS = [
  "2024-01-01", "2024-02-12", "2024-02-13", "2024-03-29",
  "2024-05-01", "2024-05-30", "2024-07-09", "2024-09-07",
  "2024-10-12", "2024-11-02", "2024-11-15", "2024-11-20",
  "2024-12-25",
  "2025-01-01", "2025-03-03", "2025-03-04", "2025-04-18",
  "2025-04-21", "2025-05-01", "2025-06-19", "2025-07-09",
  "2025-09-07", "2025-10-12", "2025-11-02", "2025-11-15",
  "2025-11-20", "2025-12-25",
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03",
  "2026-04-21", "2026-05-01", "2026-06-04", "2026-07-09",
  "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15",
  "2026-11-20", "2026-12-25",
];

const avancarDiasUteis = (dataIso: string, dias: number) => {
  if (!dataIso) return "";

  const d = new Date(dataIso + "T12:00:00");
  let contador = dias;

  while (contador > 0) {
    d.setDate(d.getDate() + 1);

    const diaSemana = d.getDay();
    const dataString = d.toISOString().slice(0, 10);

    if (
      diaSemana !== 0 &&
      diaSemana !== 6 &&
      !FERIADOS.includes(dataString)
    ) {
      contador--;
    }
  }

  return d.toISOString().slice(0, 10);
};

export type OperationKind = "buy" | "sell";
export type DividendKind = "income" | "amortization";
export type DividendSource =
  | "manual"
  | "yfinance"
  | "brapi"
  | "b3"
  | "render";

export type Operation = {
  id: string;
  ticker: string;
  kind: OperationKind;
  date: string;
  quantity: number;
  price: number;
  fees: number;
  source?: DividendSource;
  note?: string;
  createdAt: string;
};

export type Dividend = {
  id: string;
  ticker: string;
  paymentDate: string;
  dateCom?: string;
  amountPerShare: number;
  quantity?: number;
  kind: DividendKind;
  source: DividendSource;
  note?: string;
  createdAt: string;
};

export type Quote = {
  ticker: string;
  price: number;
  referenceDate: string;
  updatedAt: string;
};

export type Position = {
  ticker: string;
  quantity: number;
  costBasis: number;
  averagePrice: number;
  lastPrice?: number;
  marketValue?: number;
  unrealizedResult?: number;
  realizedResult: number;
};

export type Settings = {
  marketServiceUrl: string;
  brapiToken?: string;
  lastSyncAt?: string;
  lastSyncMessage?: string;
  themeName?: string;
  cardColor?: string;
  textColor?: string;
  autoSync?: boolean;
};

export type PortfolioData = {
  operations: Operation[];
  dividends: Dividend[];
  quotes: Record<string, Quote>;
  settings: Settings;
};

export type NewOperation =
  Omit<Operation, "id" | "createdAt" | "fees"> & {
    fees?: number;
    source?: DividendSource;
  };

export type NewDividend =
  Omit<Dividend, "id" | "createdAt" | "source"> & {
    source?: DividendSource;
    kind?: string;
    quantity?: number;
  };

const KEY = "@fii-guard/portfolio-v2";

const initial: PortfolioData = {
  operations: [],
  dividends: [],
  quotes: {},
  settings: {
    marketServiceUrl: "",
    brapiToken: "",
    themeName: "Oceano",
    cardColor: "#303234",
    textColor: "#F5F7FA",
    autoSync: true,
  },
};

const now = () => new Date().toISOString();

export const normalizeTicker = (value: string) =>
  value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/SA$/, "") || "";

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function toISO(d: string): string {
  if (!d) return "";

  const cleaned = d.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.slice(0, 10);
  }

  const mBR = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);

  if (mBR) {
    return `${mBR[3]}-${mBR[2].padStart(2, "0")}-${mBR[1].padStart(2, "0")}`;
  }

  return cleaned.slice(0, 10);
}

function sortedOperations(operations: Operation[]) {
  return [...(operations || [])].sort(
    (a, b) =>
      toISO(a.date).localeCompare(toISO(b.date)) ||
      a.createdAt.localeCompare(b.createdAt)
  );
}

export function calculatePositions(
  operations: Operation[],
  quotes: Record<string, Quote> = {}
): Position[] {
  const state = new Map<string, Position>();
  const sorted = sortedOperations(operations);

  for (const op of sorted) {
    const ticker = normalizeTicker(op.ticker);

    const current =
      state.get(ticker) ?? {
        ticker,
        quantity: 0,
        costBasis: 0,
        averagePrice: 0,
        realizedResult: 0,
      };

    const q = Number(op.quantity || 0);
    const p = Number(op.price || 0);
    const f = Number(op.fees || 0);

    if (op.kind === "buy") {
      current.costBasis += q * p + f;
      current.quantity += q;
    } else {
      const avg = current.quantity
        ? current.costBasis / current.quantity
        : 0;

      current.realizedResult += q * p - f - avg * q;
      current.costBasis = Math.max(0, current.costBasis - avg * q);
      current.quantity = Math.max(0, current.quantity - q);
    }

    current.averagePrice =
      current.quantity > 0.0001
        ? current.costBasis / current.quantity
        : 0;

    state.set(ticker, current);
  }

  return [...state.values()].map((p) => {
    const q = quotes[p.ticker];

    const lastPrice =
      q?.price && q.price > 0
        ? q.price
        : undefined;

    const marketValue =
      lastPrice
        ? lastPrice * p.quantity
        : p.costBasis;

    const unrealizedResult = marketValue - p.costBasis;

    if (p.quantity < 0.01) {
      return {
        ...p,
        quantity: 0,
        marketValue: 0,
        costBasis: 0,
        unrealizedResult: 0,
        lastPrice,
      };
    }

    return {
      ...p,
      lastPrice,
      marketValue,
      unrealizedResult,
    };
  });
}

export function quantityAt(
  operations: Operation[],
  ticker: string,
  date: string
) {
  const target = toISO(date);
  const tk = normalizeTicker(ticker);

  let q = 0;

  for (let i = 0; i < (operations || []).length; i++) {
    const op = operations[i];

    if (
      normalizeTicker(op.ticker) === tk &&
      toISO(op.date) <= target
    ) {
      q +=
        op.kind === "buy"
          ? op.quantity || 0
          : -(op.quantity || 0);
    }
  }

  return Math.max(0, q);
}

export function valueOfDividend(
  dividend: Dividend,
  operations: Operation[]
) {
  const q = quantityAt(
    operations,
    dividend.ticker,
    dividend.dateCom || dividend.paymentDate
  );

  return (dividend.amountPerShare || 0) * q;
}

export function snapshot(
  operations: Operation[] = [],
  quotes: Record<string, Quote> = {},
  dividends: Dividend[] = []
) {
  const positions = calculatePositions(operations, quotes);
  const active = positions.filter((p) => p.quantity > 0.01);

  // A B3 Oficial é apenas para conferência visual.
  // Não entra na soma da carteira principal.
  const filteredDividends = (dividends || []).filter(
    (d) => d.source !== "b3"
  );

  const totalDividends = filteredDividends.reduce(
    (s, d) => s + valueOfDividend(d, operations),
    0
  );

  return {
    active,
    marketValue: active.reduce((s, p) => s + (p.marketValue || 0), 0),
    investedCost: active.reduce((s, p) => s + (p.costBasis || 0), 0),
    totalResult: active.reduce((s, p) => s + (p.unrealizedResult || 0), 0),
    totalDividends,
    fundCount: active.length,
    positions,
  };
}

export function monthReport(
  operations: Operation[] = [],
  dividends: Dividend[] = [],
  key: string
) {
  try {
    const [year, month] = key.split("-").map(Number);
    const start = `${key}-01`;

    const lastDay = new Date(year, month, 0).getDate();
    const end = `${key}-${lastDay.toString().padStart(2, "0")}`;

    const items = (operations || []).filter((op) => {
      const dataLiquidacao = avancarDiasUteis(toISO(op.date), 2);
      return dataLiquidacao >= start && dataLiquidacao <= end;
    });

    // Usa apenas proventos da internet/manuais nos relatórios.
    const filteredDivs = (dividends || []).filter(
      (d) => d.source !== "b3"
    );

    const incomeTotal = filteredDivs
      .filter(
        (d) =>
          toISO(d.paymentDate) >= start &&
          toISO(d.paymentDate) <= end &&
          d.kind === "income"
      )
      .reduce((s, d) => s + valueOfDividend(d, operations), 0);

    const amortizationTotal = filteredDivs
      .filter(
        (d) =>
          toISO(d.paymentDate) >= start &&
          toISO(d.paymentDate) <= end &&
          d.kind === "amortization"
      )
      .reduce((s, d) => s + valueOfDividend(d, operations), 0);

    const purchaseTotal = items
      .filter((i) => i.kind === "buy")
      .reduce((sum, i) => sum + i.quantity * i.price + (i.fees || 0), 0);

    const saleTotal = items
      .filter((i) => i.kind === "sell")
      .reduce((sum, i) => sum + i.quantity * i.price - (i.fees || 0), 0);

    const before = calculatePositions(
      (operations || []).filter((o) => {
        const dataLiquidacao = avancarDiasUteis(toISO(o.date), 2);
        return dataLiquidacao < start;
      }),
      {}
    );

    const through = calculatePositions(
      (operations || []).filter((o) => {
        const dataLiquidacao = avancarDiasUteis(toISO(o.date), 2);
        return dataLiquidacao <= end;
      }),
      {}
    );

    const realizedResult =
      through.reduce((s, p) => s + p.realizedResult, 0) -
      before.reduce((s, p) => s + p.realizedResult, 0);

    return {
      key,
      incomeTotal,
      amortizationTotal,
      purchaseTotal,
      saleTotal,
      movementCount: items.length,
      realizedResult,
      netCashFlow:
        purchaseTotal + incomeTotal + amortizationTotal - saleTotal,
    };
  } catch {
    return {
      key,
      incomeTotal: 0,
      amortizationTotal: 0,
      purchaseTotal: 0,
      saleTotal: 0,
      movementCount: 0,
      realizedResult: 0,
      netCashFlow: 0,
    };
  }
}

export function yearReport(
  operations: Operation[] = [],
  dividends: Dividend[] = [],
  year: string
) {
  try {
    const months = Array.from({ length: 12 }, (_, i) =>
      monthReport(
        operations,
        dividends,
        `${year}-${String(i + 1).padStart(2, "0")}`
      )
    );

    return {
      incomeTotal: months.reduce((sum, m) => sum + m.incomeTotal, 0),
      amortizationTotal: months.reduce(
        (sum, m) => sum + m.amortizationTotal,
        0
      ),
      realizedResult: months.reduce((sum, m) => sum + m.realizedResult, 0),
      purchaseTotal: months.reduce((sum, m) => sum + m.purchaseTotal, 0),
      saleTotal: months.reduce((sum, m) => sum + m.saleTotal, 0),
    };
  } catch {
    return {
      incomeTotal: 0,
      amortizationTotal: 0,
      realizedResult: 0,
      purchaseTotal: 0,
      saleTotal: 0,
    };
  }
}

const Context = createContext<any>(null);

export function PortfolioProvider({
  children,
}: PropsWithChildren) {
  const [data, setData] = useState<PortfolioData>(initial);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncRef = useRef(false);

  // Conta e nuvem: operações exclusivamente manuais.
  const [cloudUser, setCloudUser] = useState<any>(null);
  const [cloudStatus, setCloudStatus] = useState(
    "Aguardando carteira local"
  );
  const [cloudReady, setCloudReady] = useState(false);
  const cloudUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          setData({
            ...initial,
            ...JSON.parse(raw),
          });
        }
      })
      .catch((error) => {
        console.error("Erro ao carregar carteira local:", error);
      })
      .finally(() => setReady(true));
  }, []);

  // AUTENTICAÇÃO: verificar se existe backup, sem carregar a carteira.
  useEffect(() => {
    if (!ready) return;

    let active = true;

    const loadAccount = async (user: any) => {
      const userId = user?.id ?? null;

      cloudUserIdRef.current = userId;
      setCloudReady(false);
      setCloudUser(user ?? null);

      if (!userId) {
        setCloudStatus("Desconectado");
        return;
      }

      setCloudStatus("Verificando backup na nuvem...");

      const { data: row, error } = await supabase
        .from("fii_guard_accounts")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!active || cloudUserIdRef.current !== userId) return;

      if (error) {
        setCloudStatus(`Erro ao verificar nuvem: ${error.message}`);
        return;
      }

      if (row) {
        setCloudReady(true);
        setCloudStatus(
          "Backup encontrado na nuvem. Restauração manual disponível."
        );
      } else {
        setCloudReady(false);
        setCloudStatus(
          "Conta sem backup na nuvem. Você pode fazer um backup manual."
        );
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;

      cloudUserIdRef.current = user?.id ?? null;
      setCloudReady(false);
      setCloudUser(user);
      setCloudStatus(
        user ? "Verificando backup na nuvem..." : "Desconectado"
      );

      // Consulta executada fora do callback de autenticação.
      setTimeout(() => {
        if (active) void loadAccount(user);
      }, 0);
    });

    // Consulta a sessão inicial também, sem depender somente do evento.
    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;

      if (error) {
        setCloudStatus(`Erro ao verificar sessão: ${error.message}`);
        return;
      }

      void loadAccount(sessionData.session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      cloudUserIdRef.current = null;
    };
  }, [ready]);

  // PERSISTÊNCIA LOCAL: continua funcionando normalmente.
  useEffect(() => {
    if (!ready) return;

    AsyncStorage.setItem(KEY, JSON.stringify(data)).catch((error) => {
      console.error("Erro ao salvar carteira local:", error);
    });

    if (Platform.OS === "web") {
      window.dispatchEvent(new Event("storage"));
    }
  }, [data, ready]);

  // PERSISTÊNCIA NA NUVEM AUTOMÁTICA: salva automaticamente as alterações locais na nuvem quando o usuário está autenticado.
  useEffect(() => {
    if (!ready || !cloudUser?.id) return;

    const userId = cloudUser.id;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const payload = {
          portfolio: data,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("fii_guard_accounts")
          .upsert({
            user_id: userId,
            ...payload,
          });

        if (cancelled) return;

        if (error) {
          console.warn("[NUVEM] Erro no salvamento automático:", error.message);
          setCloudStatus(`Erro ao sincronizar nuvem: ${error.message}`);
        } else {
          setCloudReady(true);
          setCloudStatus("Sincronizado com a nuvem (automático)");
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn("[NUVEM] Falha na sincronização automática:", err?.message);
        }
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data, ready, cloudUser?.id]);

  const syncMarketData = useCallback(
    async (customTickers?: string[]) => {
      if (syncRef.current) return;

      syncRef.current = true;

      try {
        const tickers =
          customTickers ||
          [
            ...new Set(
              (data.operations || []).map((o) =>
                normalizeTicker(o.ticker)
              )
            ),
          ].filter(Boolean);

        if (!tickers.length) return;

        const res = await syncMarket(
          data.settings.marketServiceUrl,
          tickers,
          undefined,
          data.settings.brapiToken
        );

        if (res) {
          setData((prev) => {
            const existing = prev.dividends || [];

            const isAutomatic = (d: Dividend) =>
              d.source === "render" ||
              d.source === "brapi" ||
              d.source === "yfinance";

            const monthKey = (d: {
              ticker: string;
              paymentDate: string;
              dateCom?: string;
              kind: DividendKind;
            }) => {
              const isoDate = toISO(d.paymentDate);

              return [
                normalizeTicker(d.ticker),
                isoDate ? isoDate.slice(0, 7) : "",
                d.kind,
              ].join("|");
            };

            const result: Dividend[] = existing.filter(
              (d) => !isAutomatic(d)
            );

            const automaticMap = new Map<string, Dividend>();

            existing.filter(isAutomatic).forEach((d) => {
              const key = monthKey(d);
              if (!key) return;

              if (!automaticMap.has(key)) {
                automaticMap.set(key, d);
              }
            });

            res.dividends.forEach((n) => {
              const prepared = prepareDividend(n);
              const key = monthKey(prepared);
              if (!key) return;

              const old = automaticMap.get(key);

              if (old) {
                automaticMap.set(key, {
                  ...prepared,
                  id: old.id,
                  createdAt: old.createdAt,
                });
              } else {
                automaticMap.set(key, prepared);
              }
            });

            automaticMap.forEach((d) => result.push(d));

            return {
              ...prev,
              quotes: {
                ...prev.quotes,
                ...Object.fromEntries(
                  res.quotes.map((q) => [
                    normalizeTicker(q.ticker),
                    q,
                  ])
                ),
              },
              dividends: result,
              settings: {
                ...prev.settings,
                lastSyncAt: now(),
                lastSyncMessage: res.message,
              },
            };
          });
        }
      } finally {
        syncRef.current = false;
      }
    },
    [
      data.operations,
      data.settings.marketServiceUrl,
      data.settings.brapiToken,
    ]
  );

  const value = useMemo(
    () => ({
      ...data,

      ready,

      snapshot: snapshot(
        data.operations,
        data.quotes,
        data.dividends
      ),

      addOperation: (i: any) =>
        setData((p) => ({
          ...p,
          operations: [
            ...(p.operations || []),
            prepareOperation(i),
          ],
        })),

      updateOperation: (operationId: string, i: any) =>
        setData((p) => ({
          ...p,
          operations: (p.operations || []).map((o) =>
            o.id === operationId ? prepareOperation(i, o) : o
          ),
        })),

      deleteOperation: (operationId: string) =>
        setData((p) => ({
          ...p,
          operations: (p.operations || []).filter(
            (o) => o.id !== operationId
          ),
        })),

      addDividend: (i: any) =>
        setData((p) => ({
          ...p,
          dividends: [
            ...(p.dividends || []),
            prepareDividend(i),
          ],
        })),

      updateDividend: (dividendId: string, i: any) =>
        setData((p) => ({
          ...p,
          dividends: (p.dividends || []).map((d) =>
            d.id === dividendId ? prepareDividend(i, d) : d
          ),
        })),

      deleteDividend: (dividendId: string) =>
        setData((p) => ({
          ...p,
          dividends: (p.dividends || []).filter(
            (d) => d.id !== dividendId
          ),
        })),

      updateSettings: (s: any) =>
        setData((p) => ({
          ...p,
          settings: {
            ...p.settings,
            ...s,
          },
        })),

      syncMarketData,

      cloudUser,
      cloudStatus,
      cloudReady,

      signIn: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
      },

      signUp: async (email: string, password: string) => {
        const { data: result, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        return {
          needsEmailConfirmation: !result.session,
        };
      },

      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },

      /*
       * BACKUP MANUAL NA NUVEM
       *
       * uploadLocalToCloud() cria o backup se ainda não existir.
       * uploadLocalToCloud(true) permite substituir um backup existente.
       * A confirmação deve ser exibida pela tela antes de passar true.
       */
      uploadLocalToCloud: async (replaceExisting = false) => {
        const userId = cloudUser?.id;

        if (!userId || cloudUserIdRef.current !== userId) {
          throw new Error(
            "Entre na sua conta antes de enviar a carteira."
          );
        }

        setCloudStatus("Verificando backup existente...");

        const { data: existing, error: lookupError } = await supabase
          .from("fii_guard_accounts")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (cloudUserIdRef.current !== userId) {
          throw new Error(
            "A conta mudou durante a operação. Entre novamente."
          );
        }

        if (lookupError) {
          setCloudStatus("Não foi possível verificar o backup.");
          throw lookupError;
        }

        if (existing && !replaceExisting) {
          setCloudReady(true);
          setCloudStatus(
            "Backup existente encontrado. Confirme a substituição."
          );
          throw new Error(
            "Já existe um backup na nuvem. Confirme a substituição antes de continuar."
          );
        }

        setCloudStatus("Enviando backup manual...");

        const payload = {
          portfolio: data,
          updated_at: now(),
        };

        if (existing) {
          const { error } = await supabase
            .from("fii_guard_accounts")
            .update(payload)
            .eq("user_id", userId);

          if (error) {
            setCloudStatus(
              `Erro ao substituir backup: ${error.message}`
            );
            throw error;
          }
        } else {
          const { error } = await supabase
            .from("fii_guard_accounts")
            .insert({
              user_id: userId,
              ...payload,
            });

          if (error) {
            setCloudStatus(
              `Erro ao criar backup: ${error.message}`
            );
            throw error;
          }
        }

        if (cloudUserIdRef.current !== userId) {
          throw new Error(
            "A conta mudou durante o envio. Verifique a conta antes de continuar."
          );
        }

        setCloudReady(true);
        setCloudStatus("Backup manual concluído na nuvem.");
        return true;
      },

      /*
       * RESTAURAÇÃO MANUAL
       *
       * Esta função não apresenta a confirmação visual.
       * A tela de configurações deve pedir confirmação antes de chamá-la.
       * A carteira local só é substituída depois de validar os dados recebidos.
       */
      restoreCloudPortfolio: async () => {
        const userId = cloudUser?.id;

        if (!userId || cloudUserIdRef.current !== userId) {
          throw new Error(
            "Entre na sua conta antes de restaurar o backup."
          );
        }

        setCloudStatus("Lendo backup da nuvem...");

        const { data: row, error } = await supabase
          .from("fii_guard_accounts")
          .select("portfolio")
          .eq("user_id", userId)
          .maybeSingle();

        if (cloudUserIdRef.current !== userId) {
          throw new Error(
            "A conta mudou durante a restauração. Entre novamente."
          );
        }

        if (error) {
          setCloudStatus(
            `Erro ao ler backup: ${error.message}`
          );
          throw error;
        }

        if (!row) {
          setCloudReady(false);
          setCloudStatus("Não existe backup na nuvem para esta conta.");
          throw new Error(
            "Nenhum backup foi encontrado na nuvem."
          );
        }

        const remote = row.portfolio as Partial<PortfolioData> | null;

        if (
          !remote ||
          typeof remote !== "object" ||
          Array.isArray(remote) ||
          !Array.isArray(remote.operations) ||
          !Array.isArray(remote.dividends) ||
          !remote.quotes ||
          typeof remote.quotes !== "object" ||
          Array.isArray(remote.quotes) ||
          !remote.settings ||
          typeof remote.settings !== "object" ||
          Array.isArray(remote.settings)
        ) {
          setCloudStatus(
            "Backup inválido. A carteira local foi preservada."
          );
          throw new Error(
            "O backup da nuvem está incompleto ou inválido. Nenhum dado local foi alterado."
          );
        }

        const restored: PortfolioData = {
          ...initial,
          ...remote,
          operations: remote.operations,
          dividends: remote.dividends,
          quotes: remote.quotes,
          settings: {
            ...initial.settings,
            ...remote.settings,
          },
        };

        // Confere a conta novamente antes de substituir os dados locais.
        if (cloudUserIdRef.current !== userId) {
          throw new Error(
            "A conta mudou durante a restauração. A carteira local foi preservada."
          );
        }

        setData(restored);
        setCloudReady(true);
        setCloudStatus(
          "Backup restaurado manualmente. Confira sua carteira."
        );

        return true;
      },

      importB3: async (mode: "merge" | "update" = "merge") => {
        const imp = await importB3Spreadsheet();

        if (!imp) return null;

        const newOps = imp.operations.map((o) =>
          prepareOperation({
            ...o,
            source: "b3",
          })
        );

        const newDivs = imp.dividends.map((d) =>
          prepareDividend({
            ...d,
            source: "b3",
          })
        );

        let importedCount = 0;
        let duplicateCount = 0;

        setData((p) => {
          const prevOps = p.operations || [];
          const prevDivs = p.dividends || [];

          if (mode === "merge") {
            importedCount = newOps.length + newDivs.length;

            return {
              ...p,
              operations: [...newOps],
              dividends: [...newDivs],
            };
          }

          const uniqueOps = newOps.filter(
            (n) =>
              !prevOps.some(
                (e) =>
                  normalizeTicker(e.ticker) === normalizeTicker(n.ticker) &&
                  toISO(e.date) === toISO(n.date) &&
                  Math.abs(e.quantity - n.quantity) < 0.001
              )
          );

          const uniqueDivs = newDivs.filter(
            (n) =>
              !prevDivs.some(
                (e) =>
                  e.source === "b3" &&
                  normalizeTicker(n.ticker) === normalizeTicker(e.ticker) &&
                  toISO(n.paymentDate) === toISO(e.paymentDate) &&
                  Math.abs(n.amountPerShare - e.amountPerShare) < 0.0001
              )
          );

          importedCount = uniqueOps.length + uniqueDivs.length;
          duplicateCount =
            newOps.length + newDivs.length - importedCount;

          return {
            ...p,
            operations: [...prevOps, ...uniqueOps],
            dividends: [...prevDivs, ...uniqueDivs],
          };
        });

        return {
          imported: newOps.length + newDivs.length,
          duplicates: 0,
          warnings: imp.warnings || [],
        };
      },

      clearManualOperations: () => {
        const opsCount = (data.operations || []).filter(
          (op) => op.source === "manual" || !op.source
        ).length;

        const divsCount = (data.dividends || []).filter(
          (d) => d.source === "manual" || !d.source
        ).length;

        setData((p) => ({
          ...p,
          operations: (p.operations || []).filter(
            (op) => op.source && op.source !== "manual"
          ),
          dividends: (p.dividends || []).filter(
            (d) => d.source && d.source !== "manual"
          ),
        }));

        return opsCount + divsCount;
      },

      clearB3Operations: () => {
        const opsCount = (data.operations || []).filter(
          (op) => op.source === "b3"
        ).length;

        const divsCount = (data.dividends || []).filter(
          (d) => d.source === "b3"
        ).length;

        setData((p) => ({
          ...p,
          operations: (p.operations || []).filter(
            (op) => op.source !== "b3"
          ),
          dividends: (p.dividends || []).filter(
            (d) => d.source !== "b3"
          ),
        }));

        return opsCount + divsCount;
      },

      clearSyncDividends: () => {
        const count = (data.dividends || []).filter(
          (d) =>
            d.source === "render" ||
            d.source === "brapi" ||
            d.source === "yfinance"
        ).length;

        setData((p) => ({
          ...p,
          dividends: (p.dividends || []).filter(
            (d) =>
              d.source !== "render" &&
              d.source !== "brapi" &&
              d.source !== "yfinance"
          ),
        }));

        return count;
      },

      clearManualDividends: () => {
        setData((p) => ({
          ...p,
          dividends: (p.dividends || []).filter(
            (d) => d.source !== "manual"
          ),
        }));
      },

      exportData: () => shareBackup(data),

      importData: async () => {
        const b = await pickBackup();

        if (b) {
          setData((prev) => ({
            ...prev,
            operations: b.operations || [],
            dividends: b.dividends || [],
            quotes: b.quotes || {},
            settings: b.settings || prev.settings,
          }));

          return true;
        }

        return false;
      },
    }),
    [
      data,
      ready,
      syncing,
      syncMarketData,
      cloudUser,
      cloudStatus,
      cloudReady,
    ]
  );

  return React.createElement(
    Context.Provider,
    { value },
    children
  );
}

function prepareOperation(
  input: NewOperation,
  original?: Operation
): Operation {
  const ticker = normalizeTicker(input.ticker);
  const quantity = Number(input.quantity || 0);
  const price = Number(input.price || 0);
  const date = toISO(input.date);

  if (!ticker || !date || quantity <= 0) {
    throw new Error("Dados inválidos.");
  }

  return {
    ...input,
    ticker,
    quantity,
    price,
    fees: Number(input.fees || 0),
    date,
    id: original?.id ?? id("op"),
    source: input.source || original?.source || "manual",
    createdAt: original?.createdAt || now(),
  };
}

function prepareDividend(
  input: NewDividend,
  original?: Dividend
): Dividend {
  const ticker = normalizeTicker(input.ticker);
  const amount = Number(input.amountPerShare || 0);
  const paymentDate = toISO(input.paymentDate);

  if (!ticker || !paymentDate || amount <= 0) {
    throw new Error("Dados de provento inválidos.");
  }

  const rawKind = String(input.kind || "income").toLowerCase();

  const kind: DividendKind = rawKind.includes("amort")
    ? "amortization"
    : "income";

  return {
    ...input,
    ticker,
    amountPerShare: amount,
    quantity: input.quantity,
    kind,
    paymentDate,
    dateCom: toISO(input.dateCom || ""),
    id: original?.id || id("div"),
    source: input.source || "manual",
    createdAt: original?.createdAt || now(),
  } as Dividend;
}

export function usePortfolio() {
  return useContext(Context);
}