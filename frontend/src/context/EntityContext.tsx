/**
 * ジェネリックEntityContext。
 * 全エンティティタイプを一つのProviderで管理し、
 * エンティティ間参照を entity.{type} 形式で解決する。
 */
import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { entityApi, EntityType, FlowEntity } from "../api/entities";

// ---- 型定義 ----

type EntityMap = Record<number | string, FlowEntity>;
type StoreState = Record<EntityType, EntityMap>;

interface HistoryEntry {
  type: EntityType;
  id: number | string;
  before: FlowEntity | undefined;
  after: FlowEntity | undefined;
}

interface EntityStore {
  state: StoreState;
  past: HistoryEntry[][];
  future: HistoryEntry[][];
  pendingDiffs: {
    type: EntityType;
    id: number | string | null;
    patch: Partial<FlowEntity>;
    action: string;
  }[];
}

type Action =
  | { kind: "LOAD"; entityType: EntityType; entities: FlowEntity[] }
  | {
      kind: "PATCH";
      entityType: EntityType;
      id: number | string;
      patch: Partial<FlowEntity>;
    }
  | { kind: "CREATE"; entityType: EntityType; entity: FlowEntity; tempId: string }
  | { kind: "DELETE"; entityType: EntityType; id: number | string }
  | { kind: "UNDO" }
  | { kind: "UNDO_ALL" }
  | { kind: "REDO" }
  | { kind: "REDO_ALL" }
  | { kind: "CLEAR_PENDING" }
  | { kind: "CLEAR_ALL_HISTORY" }
  | { kind: "RESTORE"; store: Pick<EntityStore, "state" | "past" | "future"> }
  /** LOAD 完了後に past の最新 after を state にマージして履歴を反映する */
  | { kind: "APPLY_PAST_TO_STATE" };

const ENTITY_TYPES: EntityType[] = [
  "HumanUser",
  "Project",
  "Asset",
  "Task",
  "Phase",
  "Step",
  "Estimation",
];

function emptyState(): StoreState {
  return Object.fromEntries(ENTITY_TYPES.map((t) => [t, {}])) as StoreState;
}

function applyHistory(
  state: StoreState,
  entry: HistoryEntry,
  direction: "undo" | "redo",
): StoreState {
  const map = { ...state[entry.type] };
  const target = direction === "undo" ? entry.before : entry.after;
  if (target === undefined) {
    delete map[entry.id];
  } else {
    map[entry.id] = target;
  }
  return { ...state, [entry.type]: map };
}

function reducer(store: EntityStore, action: Action): EntityStore {
  switch (action.kind) {
    case "LOAD": {
      const map: EntityMap = {};
      for (const e of action.entities) map[e.id] = e;
      return { ...store, state: { ...store.state, [action.entityType]: map } };
    }
    case "PATCH": {
      const before = store.state[action.entityType][action.id];
      const after = { ...before, ...action.patch };
      const entry: HistoryEntry = {
        type: action.entityType,
        id: action.id,
        before,
        after,
      };
      // _new_* IDのエンティティへのpatchは、create diffのマージ更新として扱う
      // pendingDiffsに既存のcreateがあればそれをマージ、なければupdateとして積む
      const existingCreateIdx = store.pendingDiffs.findIndex(
        (d) => d.type === action.entityType && d.action === "create" &&
               d.patch.id === action.id
      );
      let newPendingDiffs;
      if (existingCreateIdx >= 0) {
        // 既存のcreate diffにマージ
        newPendingDiffs = store.pendingDiffs.map((d, i) =>
          i === existingCreateIdx
            ? { ...d, patch: { ...d.patch, ...action.patch } }
            : d
        );
      } else {
        newPendingDiffs = [
          ...store.pendingDiffs,
          {
            type: action.entityType,
            id: action.id,
            patch: action.patch,
            action: "update",
          },
        ];
      }
      return {
        ...store,
        state: {
          ...store.state,
          [action.entityType]: {
            ...store.state[action.entityType],
            [action.id]: after,
          },
        },
        past: [...store.past, [entry]],
        future: [],
        pendingDiffs: newPendingDiffs,
      };
    }
    case "CREATE": {
      const entry: HistoryEntry = {
        type: action.entityType,
        id: action.tempId,
        before: undefined,
        after: action.entity,
      };
      return {
        ...store,
        state: {
          ...store.state,
          [action.entityType]: {
            ...store.state[action.entityType],
            [action.tempId]: action.entity,
          },
        },
        past: [...store.past, [entry]],
        future: [],
        pendingDiffs: [
          ...store.pendingDiffs,
          {
            type: action.entityType,
            id: action.tempId,   // 仮IDを保持（commit時にcreateと判定するため）
            patch: action.entity,
            action: "create",
          },
        ],
      };
    }
    case "DELETE": {
      const before = store.state[action.entityType][action.id];
      const map = { ...store.state[action.entityType] };
      delete map[action.id];
      const entry: HistoryEntry = {
        type: action.entityType,
        id: action.id,
        before,
        after: undefined,
      };
      // 仮IDのエンティティ削除はpendingDiffsのcreateを取り消す
      const isTemp = typeof action.id === "string" && String(action.id).startsWith("_new_");
      const newPendingDiffs = isTemp
        ? store.pendingDiffs.filter(
            (d) => !(d.type === action.entityType && d.id === action.id && d.action === "create")
          )
        : [
            ...store.pendingDiffs,
            { type: action.entityType, id: action.id, patch: {}, action: "delete" },
          ];
      return {
        ...store,
        state: { ...store.state, [action.entityType]: map },
        past: [...store.past, [entry]],
        future: [],
        pendingDiffs: newPendingDiffs,
      };
    }
    case "UNDO": {
      if (store.past.length === 0) return store;
      const entries = store.past[store.past.length - 1];
      let newState = store.state;
      for (const e of entries) newState = applyHistory(newState, e, "undo");
      return {
        ...store,
        state: newState,
        past: store.past.slice(0, -1),
        future: [entries, ...store.future],
      };
    }
    case "UNDO_ALL": {
      if (store.past.length === 0) return store;
      let newState = store.state;
      const allPast = [...store.past];
      for (let i = allPast.length - 1; i >= 0; i--) {
        for (const e of allPast[i]) newState = applyHistory(newState, e, "undo");
      }
      return {
        ...store,
        state: newState,
        past: [],
        future: [...allPast.reverse(), ...store.future],
      };
    }
    case "REDO": {
      if (store.future.length === 0) return store;
      const entries = store.future[0];
      let newState = store.state;
      for (const e of entries) newState = applyHistory(newState, e, "redo");
      return {
        ...store,
        state: newState,
        past: [...store.past, entries],
        future: store.future.slice(1),
      };
    }
    case "REDO_ALL": {
      if (store.future.length === 0) return store;
      let newState = store.state;
      const allFuture = [...store.future];
      for (const group of allFuture) {
        for (const e of group) newState = applyHistory(newState, e, "redo");
      }
      return {
        ...store,
        state: newState,
        past: [...store.past, ...allFuture],
        future: [],
      };
    }
    case "CLEAR_PENDING":
      return { ...store, pendingDiffs: [] };
    case "CLEAR_ALL_HISTORY":
      return { ...store, past: [], future: [], pendingDiffs: [] };
    case "RESTORE":
      return { ...store, state: action.store.state, past: action.store.past, future: action.store.future };
    case "APPLY_PAST_TO_STATE": {
      // past の全エントリを古い順に再適用して最新 state を再構築する
      // LOAD で取得したサーバー state をベースに、past の変更を上書きする
      let newState = store.state;
      for (const group of store.past) {
        for (const entry of group) {
          if (entry.after !== undefined) {
            newState = {
              ...newState,
              [entry.type]: { ...newState[entry.type], [entry.id]: entry.after },
            };
          } else {
            // after が undefined = 削除操作
            const map = { ...newState[entry.type] };
            delete map[entry.id];
            newState = { ...newState, [entry.type]: map };
          }
        }
      }
      return { ...store, state: newState };
    }
    default:
      return store;
  }
}

// ---- Context ----

export interface PendingDiffSummary {
  type: EntityType;
  id: number | string | null;
  action: string;
  /** 変更フィールドのキー一覧（update の場合） */
  fields: string[];
}

interface EntityContextValue {
  state: StoreState;
  canUndo: boolean;
  canRedo: boolean;
  pastCount: number;
  futureCount: number;
  pendingCount: number;
  loadAll: () => Promise<void>;
  load: (type: EntityType) => Promise<void>;
  patch: (type: EntityType, id: number | string, data: Partial<FlowEntity>) => void;
  create: (type: EntityType, data: Partial<FlowEntity>) => void;
  remove: (type: EntityType, id: number | string) => void;
  undo: () => void;
  undoAll: () => void;
  redo: () => void;
  redoAll: () => void;
  commit: (type: EntityType) => Promise<void>;
  commitAll: () => Promise<void>;
  getPendingSummary: () => PendingDiffSummary[];
  resolve: (
    ref: { type: EntityType; id: number } | null | undefined,
  ) => FlowEntity | undefined;
  getList: (type: EntityType) => FlowEntity[];
}

const EntityContext = createContext<EntityContextValue | null>(null);

const LS_HISTORY_KEY = "entityHistory";

interface PersistedStore {
  past: HistoryEntry[][];
  future: HistoryEntry[][];
  pendingDiffs: EntityStore["pendingDiffs"];
}

function saveToLS(past: HistoryEntry[][], future: HistoryEntry[][], pendingDiffs: EntityStore["pendingDiffs"]) {
  try {
    const data: PersistedStore = { past, future, pendingDiffs };
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function loadFromLS(): PersistedStore {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedStore>;
      return {
        past: Array.isArray(parsed.past) ? parsed.past : [],
        future: Array.isArray(parsed.future) ? parsed.future : [],
        pendingDiffs: Array.isArray(parsed.pendingDiffs) ? parsed.pendingDiffs : [],
      };
    }
  } catch { /* ignore */ }
  return { past: [], future: [], pendingDiffs: [] };
}

export function EntityProvider({ children }: { children: ReactNode }) {
  const saved = loadFromLS();
  const [store, dispatch] = useReducer(reducer, {
    state: emptyState(),
    past: saved.past,
    future: saved.future,
    pendingDiffs: saved.pendingDiffs,
  });

  const load = useCallback(async (type: EntityType) => {
    const entities = await entityApi.list(type);
    dispatch({ kind: "LOAD", entityType: type, entities });
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all(ENTITY_TYPES.map(load));
    // LocalStorage から復元した past を state に反映する
    dispatch({ kind: "APPLY_PAST_TO_STATE" });
  }, [load]);

  const patch = useCallback(
    (type: EntityType, id: number | string, data: Partial<FlowEntity>) => {
      dispatch({ kind: "PATCH", entityType: type, id, patch: data });
    },
    [],
  );

  // 仮ID採番用カウンタ（コンポーネントをまたいで一意にするためモジュールスコープ）
  const create = useCallback(
    (type: EntityType, data: Partial<FlowEntity>) => {
      const tempId = `_new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const entity: FlowEntity = { id: tempId as unknown as number, type, ...data };
      dispatch({ kind: "CREATE", entityType: type, entity, tempId });
      // APIは呼ばない。commit時に送信する。
    },
    [],
  );

  const remove = useCallback((type: EntityType, id: number | string) => {
    dispatch({ kind: "DELETE", entityType: type, id });
  }, []);

  const undo = useCallback(() => dispatch({ kind: "UNDO" }), []);
  const undoAll = useCallback(() => dispatch({ kind: "UNDO_ALL" }), []);
  const redo = useCallback(() => dispatch({ kind: "REDO" }), []);
  const redoAll = useCallback(() => dispatch({ kind: "REDO_ALL" }), []);

  // past / future / pendingDiffs 変化時に LocalStorage へ保存
  React.useEffect(() => {
    saveToLS(store.past, store.future, store.pendingDiffs);
  }, [store.past, store.future, store.pendingDiffs]);

  const commit = useCallback(
    async (type: EntityType) => {
      const diffs = store.pendingDiffs.filter((d) => d.type === type);
      for (const d of diffs) {
        // _diff_id・仮ID・内部フィールドを除去したクリーンなpatchを作る
        const cleanPatch = Object.fromEntries(
          Object.entries(d.patch).filter(
            ([k, v]) =>
              k !== "_diff_id" &&
              k !== "id" &&
              !(typeof v === "string" && v.startsWith("_new_"))
          )
        ) as Partial<FlowEntity>;

        if (d.action === "create") {
          await entityApi.create(type, cleanPatch);
        } else if (d.action === "update" && typeof d.id === "number") {
          await entityApi.update(type, d.id, cleanPatch);
        } else if (d.action === "delete" && typeof d.id === "number") {
          await entityApi.delete(type, d.id);
        }
      }
      dispatch({ kind: "CLEAR_PENDING" });
    },
    [store.pendingDiffs],
  );

  const commitAll = useCallback(async () => {
    for (const d of store.pendingDiffs) {
      const cleanPatch = Object.fromEntries(
        Object.entries(d.patch).filter(
          ([k, v]) =>
            k !== "_diff_id" &&
            k !== "id" &&
            !(typeof v === "string" && v.startsWith("_new_"))
        )
      ) as Partial<FlowEntity>;

      if (d.action === "create") {
        await entityApi.create(d.type, cleanPatch);
      } else if (d.action === "update" && typeof d.id === "number") {
        await entityApi.update(d.type, d.id, cleanPatch);
      } else if (d.action === "delete" && typeof d.id === "number") {
        await entityApi.delete(d.type, d.id);
      }
    }
    // commit 後は履歴・pending をすべてクリアして状態を Fix する
    dispatch({ kind: "CLEAR_ALL_HISTORY" });
  }, [store.pendingDiffs]);

  const getPendingSummary = useCallback((): PendingDiffSummary[] => {
    return store.pendingDiffs.map((d) => ({
      type: d.type,
      id: d.id,
      action: d.action,
      fields: d.action === "update" ? Object.keys(d.patch) : [],
    }));
  }, [store.pendingDiffs]);

  const resolve = useCallback(
    (ref: { type: EntityType; id: number } | null | undefined) => {
      if (!ref) return undefined;
      return store.state[ref.type]?.[ref.id];
    },
    [store.state],
  );

  const getList = useCallback(
    (type: EntityType) => Object.values(store.state[type]),
    [store.state],
  );

  const value = useMemo<EntityContextValue>(
    () => ({
      state: store.state,
      canUndo: store.past.length > 0,
      canRedo: store.future.length > 0,
      pastCount: store.past.length,
      futureCount: store.future.length,
      pendingCount: store.pendingDiffs.length,
      loadAll,
      load,
      patch,
      create,
      remove,
      undo,
      undoAll,
      redo,
      redoAll,
      commit,
      commitAll,
      getPendingSummary,
      resolve,
      getList,
    }),
    [
      store,
      loadAll,
      load,
      patch,
      create,
      remove,
      undo,
      undoAll,
      redo,
      redoAll,
      commit,
      commitAll,
      getPendingSummary,
      resolve,
      getList,
    ],
  );

  return (
    <EntityContext.Provider value={value}>{children}</EntityContext.Provider>
  );
}

export function useEntities(): EntityContextValue {
  const ctx = useContext(EntityContext);
  if (!ctx) throw new Error("useEntities must be used within EntityProvider");
  return ctx;
}
