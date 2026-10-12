// Catalog order owns progression. Existing completed IDs remain replayable.
export const levelUnlocked = (catalog, records, id, developer = false) => {
  const index = catalog.findIndex(level=>level.id===id);
  return index >= 0 && (developer || index === 0 || Boolean(records[id]) || Boolean(records[catalog[index-1].id]));
};
export const nextPlayable = (catalog, records) => catalog.find((level,index)=>(index===0 || records[level.id] || records[catalog[index-1].id]) && !records[level.id]) || catalog[0];
