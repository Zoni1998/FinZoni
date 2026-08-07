import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultData, migrateFinanceData } from '../data/defaultData';
import { supabase } from '../lib/supabase';
import type { FinanceData } from '../types';
import { useAuth } from './AuthContext';

interface FinanceContextValue {
  data: FinanceData;
  month: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setMonth: (month: number) => void;
  reload: () => Promise<void>;
  mutate: (recipe: (draft: FinanceData) => void) => Promise<boolean>;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const cloneData = (data: FinanceData): FinanceData => JSON.parse(JSON.stringify(data)) as FinanceData;

export function FinanceProvider({ children }: React.PropsWithChildren) {
  const { session } = useAuth();
  const [data, setData] = useState<FinanceData>(createDefaultData);
  const dataRef = useRef(data);
  const [month, setMonthState] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));

  const load = useCallback(async () => {
    if (!session?.user.id) {
      const empty = createDefaultData();
      dataRef.current = empty;
      setData(empty);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: row, error: queryError } = await supabase
        .from('finances')
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (queryError) throw queryError;
      let raw: unknown = row?.data;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch {
          raw = createDefaultData();
        }
      }
      const next = migrateFinanceData(raw);
      dataRef.current = next;
      setData(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'NÃ£o foi possÃ­vel carregar seus dados.');
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (snapshot: FinanceData): Promise<boolean> => {
      if (!session?.user.id) return false;
      setSaving(true);
      try {
        const payload = JSON.stringify(snapshot);
        const { data: existing, error: checkError } = await supabase
          .from('finances')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (checkError) throw checkError;
        const result = existing
          ? await supabase.from('finances').update({ data: payload }).eq('user_id', session.user.id)
          : await supabase.from('finances').insert({ user_id: session.user.id, data: payload });
        if (result.error) throw result.error;
        setError(null);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'NÃ£o foi possÃ­vel salvar na nuvem.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [session?.user.id],
  );

  const mutate = useCallback(
    async (recipe: (draft: FinanceData) => void): Promise<boolean> => {
      const previous = dataRef.current;
      const next = cloneData(previous);
      recipe(next);
      dataRef.current = next;
      setData(next);
      saveQueue.current = saveQueue.current.catch(() => false).then(() => persist(next));
      const saved = await saveQueue.current;
      if (!saved && dataRef.current === next) {
        dataRef.current = previous;
        setData(previous);
      }
      return saved;
    },
    [persist],
  );

  const setMonth = useCallback((next: number) => {
    setMonthState(Math.min(12, Math.max(1, next)));
  }, []);

  const value = useMemo(
    () => ({ data, month, loading, saving, error, setMonth, reload: load, mutate }),
    [data, month, loading, saving, error, setMonth, load, mutate],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export const useFinance = (): FinanceContextValue => {
  const value = useContext(FinanceContext);
  if (!value) throw new Error('useFinance deve ser usado dentro de FinanceProvider');
  return value;
};

