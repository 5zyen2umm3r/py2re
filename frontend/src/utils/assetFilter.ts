/**
 * Asset フィルタロジック（EstimationTable・TaskSchedule 共通）
 *
 * 優先順位:
 * 1. Phase 選択あり  → sg_phase が選択 Phase に含まれる Asset
 * 2. Sub Project 選択あり → 選択 Sub Project に紐づく全 Phase の sg_phase を持つ Asset
 * 3. Project 選択あり → project が選択 Project に含まれる Asset
 * 4. 全て未選択 → 全 Asset
 */
import { FlowEntity } from "../api/entities";

export function buildAssetFilter(
  selectedProjectIds: number[],
  selectedSubProjectIds: number[],
  selectedPhaseIds: number[],
  allPhases: FlowEntity[],
): ((asset: FlowEntity) => boolean) | undefined {

  // 1. Phase 選択あり
  if (selectedPhaseIds.length > 0) {
    return (asset) =>
      selectedPhaseIds.includes((asset.sg_phase as { id: number } | undefined)?.id as number);
  }

  // 2. Sub Project 選択あり → その Sub Project に紐づく Phase の id セットを作る
  if (selectedSubProjectIds.length > 0) {
    const phaseIdsUnderSubProject = new Set(
      allPhases
        .filter((ph) =>
          selectedSubProjectIds.includes(
            (ph.sg_sub_project as { id: number } | undefined)?.id as number
          )
        )
        .map((ph) => ph.id as number)
    );
    if (phaseIdsUnderSubProject.size === 0) return () => false;
    return (asset) =>
      phaseIdsUnderSubProject.has(
        (asset.sg_phase as { id: number } | undefined)?.id as number
      );
  }

  // 3. Project 選択あり
  if (selectedProjectIds.length > 0) {
    return (asset) =>
      selectedProjectIds.includes(
        (asset.project as { id: number } | undefined)?.id as number
      );
  }

  // 4. 全て未選択
  return undefined;
}
