/**
 * Gesture State Machine — pure logic, no React dependencies
 *
 * State flow:
 * IDLE → HAND_OPEN → FIST_GRABBED → PUSH_SEND / THROW_DISCARD / IDLE
 *
 * Gesture actions:
 * - Fist grab (palm → fist): start recording
 * - Push forward (area grows → hand opens): send
 * - Throw back (area shrinks → hand opens/disappears): discard
 * - Release (hand opens without push/throw): stop recording
 *
 * Key design: grace frames allow transient misrecognitions during
 * natural hand movements (e.g. palm→fist transition often produces
 * a few "None" frames in between).
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
  graceFrames: number // frames of tolerance before dropping out of a state
  grabBaseline: { boundingBoxArea: number } | null
  pushReady: boolean // area grew past threshold (forward push)
  throwReady: boolean // area shrank past threshold (throw back)
  recentFrames: GestureFrame[] // sliding window
}

const OPEN_PALM_THRESHOLD = 2 // frames of Open_Palm needed before grab
const HAND_OPEN_GRACE = 10 // non-palm frames tolerated in HAND_OPEN before reset
const FIST_GRACE = 6 // non-fist frames tolerated in FIST_GRABBED before release
const PUSH_AREA_RATIO = 1.05 // area must grow to 105% of baseline = forward push
const THROW_BACK_RATIO = 0.35 // area must shrink to 35% of baseline = throw back
const RECENT_FRAMES_MAX = 12

export function createMachineContext(): MachineContext {
  return {
    state: "IDLE",
    openPalmFrames: 0,
    graceFrames: 0,
    grabBaseline: null,
    pushReady: false,
    throwReady: false,
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
          next.graceFrames = 0
        }
      } else {
        // Allow a couple of non-palm frames in IDLE accumulation too
        // but only if we already started counting
        if (ctx.openPalmFrames > 0 && gesture !== null) {
          // Don't reset completely — just don't increment
        } else {
          next.openPalmFrames = 0
        }
      }
      break
    }

    case "HAND_OPEN": {
      if (gesture === "Closed_Fist") {
        // Transition to FIST_GRABBED
        next.state = "FIST_GRABBED"
        next.grabBaseline = { boundingBoxArea: frame.boundingBoxArea }
        next.openPalmFrames = 0
        next.graceFrames = 0
        next.pushReady = false
        next.throwReady = false
        action = "GRAB_START"
      } else if (gesture === "Open_Palm") {
        // Stay in HAND_OPEN, reset grace counter
        next.graceFrames = 0
      } else {
        // Non-palm, non-fist frame — use grace period instead of instant reset
        next.graceFrames = ctx.graceFrames + 1
        if (next.graceFrames > HAND_OPEN_GRACE) {
          next.state = "IDLE"
          next.openPalmFrames = 0
          next.graceFrames = 0
        }
      }
      break
    }

    case "FIST_GRABBED": {
      if (ctx.grabBaseline) {
        const areaRatio =
          frame.boundingBoxArea / ctx.grabBaseline.boundingBoxArea

        // Track push readiness: area grew (hand moves toward camera)
        if (areaRatio > PUSH_AREA_RATIO) {
          next.pushReady = true
        }
        // Track throw readiness: area shrank (hand moves away from camera)
        if (areaRatio < THROW_BACK_RATIO) {
          next.throwReady = true
        }
      }

      // Forward push: area was large enough, then hand opens/disappears
      if (next.pushReady && gesture !== "Closed_Fist") {
        next.state = "PUSH_SEND"
        action = "PUSH_SEND"
        break
      }

      // Throw back: area shrank enough, then hand opens/disappears
      if (next.throwReady && gesture !== "Closed_Fist") {
        next.state = "THROW_DISCARD"
        action = "THROW_DISCARD"
        break
      }

      // Fist is held — reset grace counter
      if (gesture === "Closed_Fist") {
        next.graceFrames = 0
      } else {
        // Non-fist frame — increment grace counter
        next.graceFrames = ctx.graceFrames + 1
        if (next.graceFrames > FIST_GRACE) {
          // Hand truly opened or disappeared without push/throw
          next.state = "IDLE"
          next.openPalmFrames = 0
          next.grabBaseline = null
          next.graceFrames = 0
          next.pushReady = false
          next.throwReady = false
          action = "RELEASE"
        }
      }
      break
    }

    case "PUSH_SEND":
    case "THROW_DISCARD": {
      // Auto-reset to IDLE
      next.state = "IDLE"
      next.openPalmFrames = 0
      next.grabBaseline = null
      next.graceFrames = 0
      next.pushReady = false
      next.throwReady = false
      next.recentFrames = []
      break
    }
  }

  return { ctx: next, action }
}
