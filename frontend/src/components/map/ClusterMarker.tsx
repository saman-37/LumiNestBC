import { divIcon, type Marker as LeafletMarker } from 'leaflet'
import { memo, useEffect, useMemo, useRef } from 'react'
import { Marker } from 'react-leaflet'
import { clusterSummary, type Cluster } from '../../lib/cluster'
import { bedsWord } from '../../lib/filters'

interface Props {
  cluster: Cluster
  dimmed: boolean
  bumped: boolean
  onZoom: (cluster: Cluster) => void
}

/** Several nearby shelters drawn as one light: total confirmed beds, with a shelter count badge. */
export const ClusterMarker = memo(function ClusterMarker({ cluster, dimmed, bumped, onZoom }: Props) {
  const ref = useRef<LeafletMarker>(null)
  const { state, label, open } = clusterSummary(cluster.members)
  const count = cluster.members.length
  const handlers = useMemo(() => ({ click: () => onZoom(cluster) }), [onZoom, cluster])

  const icon = useMemo(
    () =>
      divIcon({
        className: 'pin-marker',
        iconSize: [56, 56],
        iconAnchor: [28, 28],
        html:
          `<div class="pin pin--${state} pin--cluster${bumped ? ' pin--pop' : ''}">` +
          `<span class="pin__glow"></span><span class="pin__ring"></span>` +
          `<span class="pin__body">${label}</span><span class="pin__count">${count}</span></div>`,
      }),
    [state, label, count, bumped],
  )

  const title = `${count} shelters here, ${open} ${bedsWord(open)} open. Zoom in`
  useEffect(() => {
    const el = ref.current?.getElement()
    el?.classList.toggle('is-dimmed', dimmed)
    el?.setAttribute('aria-label', title) // Leaflet's alt only applies to image icons
  }, [icon, dimmed, title])

  return (
    <Marker
      ref={ref}
      position={[cluster.lat, cluster.lng]}
      icon={icon}
      alt={title}
      zIndexOffset={open > 0 ? 300 : 100}
      eventHandlers={handlers}
    />
  )
})
