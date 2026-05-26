import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'

type Pin = {
  id: string
  lat: number
  lng: number
  label: string
  avatarUrl: string
  isMe?: boolean
}

type GlobeProps = Record<string, unknown>
type CountryFeature = { type: string; geometry: unknown; properties?: unknown }
type Vec3 = { x: number; y: number; z: number }
type GlobeHandle = {
  pointOfView: (
    pov?: object,
    ms?: number,
  ) => { lat: number; lng: number; altitude: number }
  getCoords: (lat: number, lng: number, alt?: number) => Vec3
  getScreenCoords: (
    lat: number,
    lng: number,
    alt?: number,
  ) => { x: number; y: number }
  getGlobeRadius: () => number
  camera: () => { position: Vec3 }
}

export function SnapGlobe({
  pins,
  onGlobeClick,
  highlight,
  initialPov,
  isLocationPickerActive = false,
}: {
  pins: Pin[]
  onGlobeClick?: (coords: { lat: number; lng: number }) => void
  highlight?: Set<string>
  initialPov?: { lat: number; lng: number }
  isLocationPickerActive?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeHandle | null>(null)
  const pinRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [GlobeCmp, setGlobeCmp] = useState<ComponentType<GlobeProps> | null>(
    null,
  )
  const [material, setMaterial] = useState<unknown>(null)
  const [countries, setCountries] = useState<CountryFeature[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [pinsRevealed, setPinsRevealed] = useState(false)

  useEffect(() => {
    Promise.all([import('react-globe.gl'), import('three')]).then(
      ([globeMod, threeMod]) => {
        setGlobeCmp(
          () => globeMod.default as unknown as ComponentType<GlobeProps>,
        )
        setMaterial(
          new threeMod.MeshPhongMaterial({
            color: '#0b0b0e',
            emissive: '#000000',
            shininess: 4,
          }),
        )
      },
    )
  }, [])

  useEffect(() => {
    Promise.all([
      fetch(
        'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
      ).then((r) => r.json()),
      import('topojson-client'),
    ])
      .then(([topology, topo]) => {
        const fc = topo.feature(
          topology,
          topology.objects.countries,
        ) as unknown as {
          features: CountryFeature[]
        }
        setCountries(fc.features)
      })
      .catch(() => setCountries([]))
  }, [])

  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [])

  const applyInitialPov = useCallback(() => {
    if (!globeRef.current) return
    if (initialPov) {
      globeRef.current.pointOfView(
        { lat: initialPov.lat, lng: initialPov.lng, altitude: 2.2 },
        0,
      )
    }
    // Hold the pin reveal until the globe is fully settled — feels less janky than
    // having pins pop in alongside the first paint.
    const id = setTimeout(() => setPinsRevealed(true), 500)
    return () => clearTimeout(id)
  }, [initialPov?.lat, initialPov?.lng])

  useEffect(() => {
    applyInitialPov()
  }, [applyInitialPov])

  // RAF loop: project each pin's lat/lng to screen and update its DOM transform directly.
  // Visibility test uses dot(camera, P) > r² where P and camera are both vectors from the
  // globe center, so back-side pins fade out as the globe rotates.
  useEffect(() => {
    if (pins.length === 0) return
    let raf = 0
    const tick = () => {
      const g = globeRef.current
      if (g && typeof g.getScreenCoords === 'function') {
        const cam = g.camera()
        const r = g.getGlobeRadius()
        const r2 = r * r
        pins.forEach((p) => {
          const el = pinRefs.current.get(p.id)
          if (!el) return
          const world = g.getCoords(p.lat, p.lng, 0)
          const screen = g.getScreenCoords(p.lat, p.lng, 0)
          const dot =
            cam.position.x * world.x +
            cam.position.y * world.y +
            cam.position.z * world.z
          const visible = dot > r2
          el.style.left = `${screen.x}px`
          el.style.top = `${screen.y}px`
          el.style.opacity = visible ? '1' : '0'
          el.style.pointerEvents = visible ? 'auto' : 'none'
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pins])

  return (
    <div
      ref={wrapRef}
      className={`absolute inset-0 bg-[#070707] overflow-hidden ${
        isLocationPickerActive ? 'cursor-crosshair' : ''
      }`}
    >
      {(!GlobeCmp || size.w === 0) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[var(--appchat-muted)] text-sm animate-pulse">
            Spinning up the globe…
          </div>
        </div>
      )}
      {GlobeCmp && size.w > 0 && (
        <GlobeCmp
          ref={globeRef}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere
          atmosphereColor="#fffc00"
          atmosphereAltitude={0.18}
          globeMaterial={material}
          polygonsData={countries}
          polygonAltitude={0.006}
          polygonCapColor={() => 'rgba(255, 255, 255, 0.08)'}
          polygonSideColor={() => 'rgba(255, 252, 0, 0.06)'}
          polygonStrokeColor={() => 'rgba(255, 252, 0, 0.35)'}
          onGlobeReady={applyInitialPov}
          onGlobeClick={onGlobeClick}
          onPolygonClick={(
            _poly: object,
            _ev: MouseEvent,
            coords: { lat: number; lng: number },
          ) => onGlobeClick?.(coords)}
        />
      )}

      {/* Custom pin overlay — positions updated via RAF in the effect above */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{ opacity: pinsRevealed ? 1 : 0 }}
      >
        {pins.map((p) => {
          const classes = ['appchat-pin']
          if (p.isMe) classes.push('appchat-pin--me')
          if (highlight?.has(p.id)) classes.push('appchat-pin--new')
          return (
            <div
              key={p.id}
              ref={(el) => {
                if (el) pinRefs.current.set(p.id, el)
                else pinRefs.current.delete(p.id)
              }}
              className={classes.join(' ')}
              style={{ left: -9999, top: -9999, opacity: 0 }}
            >
              <span className="appchat-pin__avatar-wrap">
                <img className="appchat-pin__avatar" src={p.avatarUrl} alt="" />
                {p.isMe && (
                  <span className="appchat-pin__crown" aria-hidden>
                    👑
                  </span>
                )}
              </span>
              <span className="appchat-pin__name">{p.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
