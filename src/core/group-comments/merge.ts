/** 第二阶段：整组移动进入不动的组，成员与组注释一起并入目标组。 */

import type { Annotation } from '../types.js';
import { collectGroups, containsGroup, sortByOrder, updateGroupAnchors } from './shared.js';

export function mergeContainedGroup(
  annotations: Annotation[],
  moving: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
): boolean {
  const groups = collectGroups(annotations, order);
  const stationary = groups.filter((group) => !group.ids.some((id) => moving.has(id)));
  const sources = groups.filter((group) => group.ids.every((id) => moving.has(id)));
  // 不支持多个组同时吞并；正常操作只会有一个移动组。
  if (sources.length !== 1 || !stationary.length) return false;

  const source = sources[0];
  const target = stationary.find((group) => containsGroup(group, source, order));
  if (!target) return false;

  const union = sortByOrder([...target.ids, ...source.ids], order);
  const sourceNotes = source.notes;
  const targetNotes = target.notes;
  const updated = updateGroupAnchors(annotations, [...targetNotes, ...sourceNotes], union, order);
  const byId = new Map(updated.map((note) => [note.id, note]));
  const updatedSource = sourceNotes.map((note) => byId.get(note.id)!);

  const sourceIds = new Set(sourceNotes.map((note) => note.id));
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    if (sourceIds.has(annotations[index].id)) annotations.splice(index, 1);
  }
  const targetIds = new Set(targetNotes.map((note) => note.id));
  let insertAt = -1;
  for (let index = 0; index < annotations.length; index += 1) {
    if (targetIds.has(annotations[index].id)) insertAt = index;
  }
  if (insertAt < 0) return true;
  annotations.splice(insertAt + 1, 0, ...updatedSource);
  return true;
}
