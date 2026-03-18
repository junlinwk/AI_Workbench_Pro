/**
 * useHandGesture — Hook for MediaPipe hand gesture recognition + camera + state machine
 *
 * Lazy-loads @mediapipe/tasks-vision only when enabled.
 * Uses low-res camera (320×240) at ~15fps to minimize CPU usage.
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
}

export function useHandGesture(
  options: UseHandGestureOptions,
): UseHandGestureReturn {
  const { enabled, onGrabStart, onPushSend, onThrowDiscard, onRelease, fps = 15 } = options

  const [gestureState, setGestureState] = useState<GestureState>("IDLE")
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [handLandmarks, setHandLandmarks] = useState<NormalizedLandmark[] | null>(null)
  const [cameraActive, setCameraActive] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const recognizerRef = useRef<any>(null)
  const rafRef = useRef<number>(0)
  const machineCtxRef = useRef(createMachineContext())
  const streamRef = useRef<MediaStream | null>(null)
  const lastProcessTime = useRef(0)

  // Keep callbacks in refs to avoid re-creating effects
  const callbacksRef = useRef({ onGrabStart, onPushSend, onThrowDiscard, onRelease })
  callbacksRef.current = { onGrabStart, onPushSend, onThrowDiscard, onRelease }

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (recognizerRef.current) {
      recognizerRef.current.close()
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
  }, [])

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

        const recognizer = await GestureRecognizer.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        })
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
      const video = videoRef.current
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

  return {
    gestureState,
    videoRef,
    isModelLoading,
    modelLoadError,
    handLandmarks,
    cameraActive,
  }
}
