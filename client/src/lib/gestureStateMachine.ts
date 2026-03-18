/**
 * Gesture State Machine — pure logic, no React dependencies
 *
 * State flow:
 * IDLE → HAND_OPEN → FIST_GRABBED → PUSH_SEND / THROW_DISCARD / IDLE
 */

export type GestureState =
  | "IDLE"
  | "HAND_OPEN"
  | "FIST_GRABBED"
  | "PUSH_SEND"
  | "THROW_DISCARD"

export type GestureAction =
  | "GRAB_START"
  | "PUSH_SEND"
  | "THROW_DISCARD"
  | "RELEASE"
  | null

export interface GestureFrame {
  gesture: string | null // "Open_Palm" | "Closed_Fist" | "None" | null
  handCenterX: number // normalized 0-1
  handCenterY: number // normalized 0-1
  boundingBoxArea: number // bounding rect area of 21 landmarks (depth proxy)
  timestamp: number // performance.now()
}

interface MachineContext {
  state: GestureState
  openPalmFrames: number // consecutive Open_Palm frames for debounce
  grabBaseline: { boundingBoxArea: number } | null
  recentFrames: GestureFrame[] // sliding window for swipe detection
}

const OPEN_PALM_THRESHOLD = 3 // frames of Open_Palm needed before grab
const PUSH_AREA_RATIO = 1.3 // 30% area increase = forward push
const SWIPE_RIGHT_DIST = 0.25 // normalized X units
const SWIPE_TIME_WINDOW = 500 // ms
const RECENT_FRAMES_MAX = 10

export function createMachineContext(): MachineContext {
  return {
    state: "IDLE",
    openPalmFrames: 0,
    grabBaseline: null,
    recentFrames: [],
  }
}

export function processFrame(
  ctx: MachineContext,
  frame: GestureFrame,
): { ctx: MachineContext; action: GestureAction } {
  // Keep a sliding window of recent frames
  const recentFrames = [...ctx.recentFrames, frame].slice(-RECENT_FRAMES_MAX)
  let next: MachineContext = { ...ctx, recentFrames }
  let action: GestureAction = null

  const gesture = frame.gesture

  switch (ctx.state) {
    case "IDLE": {
      if (gesture === "Open_Palm") {
        next.openPalmFrames = ctx.openPalmFrames + 1
        if (next.openPalmFrames >= OPEN_PALM_THRESHOLD) {
          next.state = "HAND_OPEN"
        }
      } else {
        next.openPalmFrames = 0
      }
      break
    }

    case "HAND_OPEN": {
      if (gesture === "Closed_Fist") {
        next.state = "FIST_GRABBED"
        next.grabBaseline = { boundingBoxArea: frame.boundingBoxArea }
        next.openPalmFrames = 0
        action = "GRAB_START"
      } else if (gesture === "Open_Palm") {
        // Stay in HAND_OPEN
      } else {
        // Hand disappeared or unrecognized — back to idle
        next.state = "IDLE"
        next.openPalmFrames = 0
      }
      break
    }

    case "FIST_GRABBED": {
      // Check forward push: area increased > 30% and then hand opens/disappears
      if (ctx.grabBaseline) {
        const areaRatio = frame.boundingBoxArea / ctx.grabBaseline.boundingBoxArea
        if (areaRatio > PUSH_AREA_RATIO && gesture !== "Closed_Fist") {
          next.state = "PUSH_SEND"
          action = "PUSH_SEND"
          break
        }
      }

      // Check right swipe (in camera space, handCenterX increasing)
      if (detectRightSwipe(recentFrames, frame.timestamp)) {
        next.state = "THROW_DISCARD"
        action = "THROW_DISCARD"
        break
      }

      // Hand opened without push or disappeared
      if (!gesture || gesture === "None" || gesture === "Open_Palm") {
        next.state = "IDLE"
        next.openPalmFrames = 0
        next.grabBaseline = null
        action = "RELEASE"
      }
      break
    }

    case "PUSH_SEND":
    case "THROW_DISCARD": {
      // Auto-reset to IDLE
      next.state = "IDLE"
      next.openPalmFrames = 0
      next.grabBaseline = null
      next.recentFrames = []
      break
    }
  }

  return { ctx: next, action }
}

function detectRightSwipe(
  frames: GestureFrame[],
  now: number,
): boolean {
  // Only consider frames within the time window
  const windowFrames = frames.filter(
    (f) => now - f.timestamp < SWIPE_TIME_WINDOW,
  )
  if (windowFrames.length < 3) return false

  const first = windowFrames[0]
  const last = windowFrames[windowFrames.length - 1]
  const dx = last.handCenterX - first.handCenterX

  return dx > SWIPE_RIGHT_DIST
}
