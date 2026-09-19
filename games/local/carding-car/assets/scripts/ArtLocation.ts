/** Stable logical paths; each optional model/texture is delivered only when requested. */
export function artLocation(name: string) {
  const parts = name.split('/');
  if (parts[0] === 'audio') return { bundle: 'art-audio', path: parts.slice(1).join('/') };
  if (parts[0] === 'glacier-sample')
    return { bundle: 'art-glacier', path: parts.slice(1).join('/') };
  if (parts[0] !== 'expansion' && parts[0] !== 'seaside') parts.unshift('seaside');
  if (parts[1] === 'manifest') return { bundle: 'art-catalog', path: parts[0] };
  if (parts[0] === 'seaside')
    return {
      bundle: ['asphalt', 'road-profiles'].includes(parts[1]) ? 'art-road' : `art-${parts[1]}`,
      path: parts.slice(1).join('/'),
    };
  const [, category, id] = parts;
  const group =
    category === 'items'
      ? 'items'
      : category === 'props'
        ? `props-${id.split('-')[0]}`
        : `${category.replace(/s$/, '')}-${id}`;
  return { bundle: `art-${group}`, path: parts.slice(2).join('/') };
}
