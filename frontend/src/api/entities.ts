import { apiFetch } from "./fetch";

const BASE = import.meta.env.VITE_API_BASE as string;

export type EntityType =
  | "HumanUser"
  | "Project"
  | "Asset"
  | "Task"
  | "Phase"
  | "Step"
  | "Estimation"
  | "TimeLog"
  | "SubProject";

export interface FlowEntity {
  id: number;
  type: EntityType;
  [key: string]: unknown;
}

export const entityApi = {
  list: (type: EntityType, direct = false) =>
    apiFetch<FlowEntity[]>(`${BASE}/${type}/${direct ? "?direct=1" : ""}`),

  get: (type: EntityType, id: number) =>
    apiFetch<FlowEntity>(`${BASE}/${type}/${id}/`),

  create: (type: EntityType, data: Partial<FlowEntity>) =>
    apiFetch<FlowEntity>(`${BASE}/${type}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: (type: EntityType, id: number, patch: Partial<FlowEntity>) =>
    apiFetch<FlowEntity>(`${BASE}/${type}/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  delete: (type: EntityType, id: number) =>
    apiFetch<void>(`${BASE}/${type}/${id}/`, { method: "DELETE" }),

  /** _new_xxx 形式の文字列IDを持つ Django-only エンティティ（未FlowPT登録）を削除する */
  deleteByStringId: (type: EntityType, id: string) => {
    // "_new_42" → DELETE /api/entities/Asset/_new_42/
    // URLルーターが /_new_<int>/ パターンにマッチする
    return apiFetch<void>(`${BASE}/${type}/${id}/`, { method: "DELETE" });
  },

  sync: (type: EntityType | "all" = "all") =>
    apiFetch<Record<string, unknown>>(`${BASE}/${type}/sync/`, { method: "POST" }),

  commit: (diffIds?: number[]) =>
    apiFetch<{ status: string }>(`${BASE}/all/commit/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diff_ids: diffIds }),
    }),
};
