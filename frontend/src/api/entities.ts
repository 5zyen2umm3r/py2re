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
  | "TimeLog";

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

  sync: (type: EntityType | "all" = "all") =>
    apiFetch<Record<string, unknown>>(`${BASE}/${type}/sync/`, { method: "POST" }),

  commit: (type: EntityType, diffIds?: number[]) =>
    apiFetch<{ status: string }>(`${BASE}/${type}/commit/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diff_ids: diffIds }),
    }),
};
