// The map's last subway and bus views this session ("?line=Red", "?line=bus&route=66"), so the Map tab and the
// Subway | Bus switch go back to where you were. Kept in memory only: nothing is stored on the device.
const last = { current: '', subway: '', bus: '?line=bus' }

export function rememberMapView(search: string) {
  last.current = search
  if (new URLSearchParams(search).get('line') === 'bus') last.bus = search
  else last.subway = search
}

/** The last view ("" for the default, every subway line), or the last of one mode. */
export const lastMapView = (mode?: 'subway' | 'bus') => (mode ? last[mode] : last.current)
