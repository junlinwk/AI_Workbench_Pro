/**
 * Hyperspeed — Star-field warp speed background effect
 * Canvas-based animated star field with configurable speed and density
 */
import { useRef, useEffect, useCallback } from "react"

interface Star {
  x: number
  y: number
  z: number
  pz: number
}

interface HyperspeedProps {
  starCount?: number
  speed?: number
  className?: string
}

export default function Hyperspeed({
  starCount = 800,
  speed = 2,
  className,
}: HyperspeedProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<Star[]>([])
  const frameRef = useRef<number>(0)

  const initStars = useCallback(
    (w: number, h: number) => {
      starsRef.current = Array.from({ length: starCount }, () => ({
        x: (Math.random() - 0.5) * w * 2,
        y: (Math.random() - 0.5) * h * 2,
        z: Math.random() * w,
        pz: 0,
      }))
      starsRef.current.forEach((s) => (s.pz = s.z))
    },
    [starCount],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
      initStars(canvas.offsetWidth, canvas.offsetHeight)
    }
    resize()
    window.addEventListener("resize", resize)

    const w = () => canvas.offsetWidth
    const h = () => canvas.offsetHeight

    const draw = () => {
      const cw = w()
      const ch = h()
      ctx.fillStyle = "rgba(0,0,0,0.15)"
      ctx.fillRect(0, 0, cw, ch)

      const cx = cw / 2
      const cy = ch / 2

      for (const star of starsRef.current) {
        star.pz = star.z
        star.z -= speed
        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * cw * 2
          star.y = (Math.random() - 0.5) * ch * 2
          star.z = cw
          star.pz = star.z
        }

        const sx = (star.x / star.z) * cx + cx
        const sy = (star.y / star.z) * cy + cy
        const px = (star.x / star.pz) * cx + cx
        const py = (star.y / star.pz) * cy + cy

        const size = (1 - star.z / cw) * 2
        const alpha = (1 - star.z / cw) * 0.8

        ctx.beginPath()
        ctx.strokeStyle = `rgba(180,200,255,${alpha})`
        ctx.lineWidth = size
        ctx.moveTo(px, py)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [speed, initStars])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  )
}
