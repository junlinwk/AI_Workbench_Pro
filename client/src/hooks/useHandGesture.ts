/**
 * useHandGesture — Hook for MediaPipe hand gesture recognition + camera + state machine
 *
 * Lazy-loads @mediapipe/tasks-vision only when enabled.
 * Uses low-res camera (320×240) at ~15fps to minimize CPU usage.
 *
 * Supports Document Picture-in-Picture: call popOutPiP() to move the camera
 * preview into a floating always-on-top mini window. The recognition loop
 * continues unthrottled because the PiP window is always "visible".
 */
import { useState, useRef, useEffect, useCallback } from "react"
import {
  createMachineContext,
  processFrame,
  type GestureState,
  type GestureFrame,
} from "@/lib/gestureStateMachine"

interface NormalizedLandmark {
  x: number
  y: number
  z: number
}

export interface UseHandGestureOptions {
  enabled: boolean
  onGrabStart: () => void
  onPushSend: () => void
  onThrowDiscard: () => void
  onRelease: () => void
  fps?: number
}

export interface UseHandGestureReturn {
  gestureState: GestureState
  videoRef: React.RefObject<HTMLVideoElement | null>
  isModelLoading: boolean
  modelLoadError: string | null
  handLandmarks: NormalizedLandmark[] | null
  cameraActive: boolean
  isPiP: boolean
  pipSupported: boolean
  popOutPiP: () => Promise<void>
  popInPiP: () => void
}

export function useHandGesture(
  options: UseHandGestureOptions,
): UseHandGestureReturn {
  const { enabled, onGrabStart, onPushSend, onThrowDiscard, onRelease, fps = 30 } = options

  const [gestureState, setGestureState] = useState<GestureState>("IDLE")
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [handLandmarks, setHandLandmarks] = useState<NormalizedLandmark[] | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [isPiP, setIsPiP] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const recognizerRef = useRef<any>(null)
  const rafRef = useRef<number>(0)
  const machineCtxRef = useRef(createMachineContext())
  const streamRef = useRef<MediaStream | null>(null)
  const lastProcessTime = useRef(0)
  const pipWindowRef = useRef<Window | null>(null)
  const pipVideoRef = useRef<HTMLVideoElement | null>(null)
  const stateRef = useRef<GestureState>("IDLE")

  // Keep callbacks in refs to avoid re-creating effects
  const callbacksRef = useRef({ onGrabStart, onPushSend, onThrowDiscard, onRelease })
  callbacksRef.current = { onGrabStart, onPushSend, onThrowDiscard, onRelease }

  const pipSupported =
    typeof window !== "undefined" && "documentPictureInPicture" in window

  const closePiPWindow = useCallback(() => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close()
    }
    pipWindowRef.current = null
    pipVideoRef.current = null
    setIsPiP(false)
  }, [])

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    closePiPWindow()
    if (recognizerRef.current) {
      try { recognizerRef.current.close() } catch { /* already closed */ }
      recognizerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setGestureState("IDLE")
    setHandLandmarks(null)
    machineCtxRef.current = createMachineContext()
  }, [closePiPWindow])

  // Sync stateRef for PiP overlay updates
  useEffect(() => {
    stateRef.current = gestureState
    updatePiPOverlay()
  }, [gestureState])

  function updatePiPOverlay() {
    const pipWin = pipWindowRef.current
    if (!pipWin || pipWin.closed) return
    const badge = pipWin.document.getElementById("pip-state")
    if (badge) {
      const state = stateRef.current
      badge.textContent = state
      badge.dataset.state = state
    }
  }

  useEffect(() => {
    if (!enabled) {
      cleanup()
      return
    }

    let cancelled = false

    async function init() {
      setIsModelLoading(true)
      setModelLoadError(null)

      try {
        // Lazy load MediaPipe
        const vision = await import("@mediapipe/tasks-vision")
        if (cancelled) return

        const { FilesetResolver, GestureRecognizer } = vision

        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        )
        if (cancelled) return

        // Try GPU first, fall back to CPU if WebGL is unavailable
        let recognizer: any
        try {
          recognizer = await GestureRecognizer.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 1,
          })
        } catch {
          // GPU delegate failed — fall back to CPU
          recognizer = await GestureRecognizer.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numHands: 1,
          })
        }
        if (cancelled) {
          recognizer.close()
          return
        }

        recognizerRef.current = recognizer
        setIsModelLoading(false)

        // Start camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 320, height: 240 },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraActive(true)

        // Start processing loop
        const frameInterval = 1000 / fps
        function loop() {
          if (cancelled) return

          const now = performance.now()
          if (now - lastProcessTime.current >= frameInterval) {
            lastProcessTime.current = now
            processVideoFrame(now)
          }

          rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
      } catch (err: any) {
        if (!cancelled) {
          setIsModelLoading(false)
          setModelLoadError(err?.message || "Failed to initialize gesture recognition")
        }
      }
    }

    function processVideoFrame(timestamp: number) {
      // Use PiP video if available, otherwise main video
      const video = pipVideoRef.current || videoRef.current
      const recognizer = recognizerRef.current
      if (!video || !recognizer || video.readyState < 2) return

      let result: any
      try {
        result = recognizer.recognizeForVideo(video, timestamp)
      } catch {
        return
      }

      const gestureName =
        result.gestures?.[0]?.[0]?.categoryName ?? null
      const landmarks: NormalizedLandmark[] | null =
        result.landmarks?.[0] ?? null

      setHandLandmarks(landmarks)

      // Compute frame data
      let handCenterX = 0.5
      let handCenterY = 0.5
      let boundingBoxArea = 0

      if (landmarks && landmarks.length > 0) {
        let minX = 1, maxX = 0, minY = 1, maxY = 0
        let sumX = 0, sumY = 0
        for (const lm of landmarks) {
          sumX += lm.x
          sumY += lm.y
          if (lm.x < minX) minX = lm.x
          if (lm.x > maxX) maxX = lm.x
          if (lm.y < minY) minY = lm.y
          if (lm.y > maxY) maxY = lm.y
        }
        handCenterX = sumX / landmarks.length
        handCenterY = sumY / landmarks.length
        boundingBoxArea = (maxX - minX) * (maxY - minY)
      }

      const frame: GestureFrame = {
        gesture: gestureName,
        handCenterX,
        handCenterY,
        boundingBoxArea,
        timestamp,
      }

      const { ctx: newCtx, action } = processFrame(
        machineCtxRef.current,
        frame,
      )
      machineCtxRef.current = newCtx
      setGestureState(newCtx.state)

      if (action) {
        switch (action) {
          case "GRAB_START":
            callbacksRef.current.onGrabStart()
            break
          case "PUSH_SEND":
            callbacksRef.current.onPushSend()
            break
          case "THROW_DISCARD":
            callbacksRef.current.onThrowDiscard()
            break
          case "RELEASE":
            callbacksRef.current.onRelease()
            break
        }
      }
    }

    init()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [enabled, fps, cleanup])

  /**
   * Pop the camera preview into a Document Picture-in-Picture window.
   * The window stays on top even when the main tab is in background,
   * keeping the camera stream and RAF loop running without throttling.
   */
  const popOutPiP = useCallback(async () => {
    if (!pipSupported || !streamRef.current) return

    try {
      const docPiP = (window as any).documentPictureInPicture
      const pipWin: Window = await docPiP.requestWindow({
        width: 180,
        height: 200,
      })
      pipWindowRef.current = pipWin

      // Inject styles into PiP document
      const style = pipWin.document.createElement("style")
      style.textContent = `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #0a0a0f;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          gap: 6px;
          font-family: system-ui, sans-serif;
          overflow: hidden;
          user-select: none;
        }
        video {
          width: 160px;
          height: 120px;
          border-radius: 10px;
          object-fit: cover;
          transform: scaleX(-1);
          border: 2px solid rgba(255,255,255,0.15);
        }
        #pip-state {
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #fff;
          background: #52525b;
          transition: background 0.2s;
        }
        #pip-state[data-state="HAND_OPEN"]    { background: #3b82f6; }
        #pip-state[data-state="FIST_GRABBED"]  { background: #8b5cf6; }
        #pip-state[data-state="PUSH_SEND"]     { background: #22c55e; }
        #pip-state[data-state="THROW_DISCARD"] { background: #ef4444; }
        #pip-hint {
          font-size: 9px;
          color: rgba(255,255,255,0.3);
          text-align: center;
          line-height: 1.3;
        }
      `
      pipWin.document.head.appendChild(style)

      // Create video element in PiP
      const pipVideo = pipWin.document.createElement("video")
      pipVideo.autoplay = true
      pipVideo.playsInline = true
      pipVideo.muted = true
      pipVideo.srcObject = streamRef.current
      pipWin.document.body.appendChild(pipVideo)

      // State badge
      const badge = pipWin.document.createElement("div")
      badge.id = "pip-state"
      badge.textContent = stateRef.current
      badge.dataset.state = stateRef.current
      pipWin.document.body.appendChild(badge)

      // Hint text
      const hint = pipWin.document.createElement("div")
      hint.id = "pip-hint"
      hint.innerHTML = "✋ Palm → ✊ Fist = REC<br>Push fwd = Send / Pull back = Discard"
      pipWin.document.body.appendChild(hint)

      await pipVideo.play()
      pipVideoRef.current = pipVideo
      setIsPiP(true)

      // Listen for PiP window close
      pipWin.addEventListener("pagehide", () => {
        pipVideoRef.current = null
        pipWindowRef.current = null
        setIsPiP(false)
      })
    } catch (err: any) {
      console.warn("Document PiP failed:", err)
    }
  }, [pipSupported])

  const popInPiP = useCallback(() => {
    closePiPWindow()
  }, [closePiPWindow])

  return {
    gestureState,
    videoRef,
    isModelLoading,
    modelLoadError,
    handLandmarks,
    cameraActive,
    isPiP,
    pipSupported,
    popOutPiP,
    popInPiP,
  }
}
