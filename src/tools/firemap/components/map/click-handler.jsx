/**
 * components/map/click-handler.jsx
 *
 * React hook: attaches click listeners on the MapLibre map to dispatch
 * SELECT_CELL / DESELECT_CELL actions.
 */

import { useEffect } from 'react'
import { Actions } from '../../contracts/events.js'

/**
 * Adds map click listeners. Cleans up on unmount or when map changes.
 *
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../../contracts/project-config').ProjectConfig} config
 * @param {Function} dispatch
 */
export function useClickHandler(map, config, dispatch) {
  useEffect(() => {
    if (!map) return

    // Click on a firemap cell feature — dispatch SELECT_CELL
    const onCellClick = (e) => {
      const props = e.features[0]?.properties
      if (!props) return
      dispatch({
        type: Actions.SELECT_CELL,
        cell: {
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          values: props,
        },
      })
    }

    // Click on empty map area — dispatch DESELECT_CELL
    const onMapClick = (e) => {
      // queryRenderedFeatures at the click point to check if we hit a cell
      const features = map.queryRenderedFeatures(e.point, { layers: ['firemap-cells'] })
      if (features.length === 0) {
        dispatch({ type: Actions.DESELECT_CELL })
      }
    }

    // Change cursor to pointer when hovering over cells
    const onCellMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const onCellMouseLeave = () => {
      map.getCanvas().style.cursor = ''
    }

    map.on('click', 'firemap-cells', onCellClick)
    map.on('click', onMapClick)
    map.on('mouseenter', 'firemap-cells', onCellMouseEnter)
    map.on('mouseleave', 'firemap-cells', onCellMouseLeave)

    return () => {
      map.off('click', 'firemap-cells', onCellClick)
      map.off('click', onMapClick)
      map.off('mouseenter', 'firemap-cells', onCellMouseEnter)
      map.off('mouseleave', 'firemap-cells', onCellMouseLeave)
    }
  }, [map, dispatch])
}
