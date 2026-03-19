/**
 * Audio client — STT (Whisper) and TTS via server proxy
 *
 * API keys are stored server-side. The client sends its Supabase auth token
 * and the proxy injects the Groq key. No raw API keys in client code.
 *
 * Fallback to browser SpeechSynthesis if proxy is unavailable.
 */
import { getAuthToken } from "@/lib/supabase"

/** Transcribe audio blob to text using server proxy (Groq Whisper) */
export async function transcribeAudio(
  blob: Blob,
  _apiKeyUnused?: string,
  language: "auto" | "zh" | "en" = "auto",
): Promise<string> {
  const reader = new FileReader()
  const base64 = await new Promise<string>((resolve) => {
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(",")[1] || "")
    }
    reader.readAsDataURL(blob)
  })

  const authToken = await getAuthToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`
  }

  const res = await fetch("/api/audio/transcribe", {
    method: "POST",
    headers,
    body: JSON.stringify({ audio: base64, language }),
  })

  if (res.ok) {
    const data = await res.json()
    return data.text || ""
  }

  throw new Error("transcription_failed")
}

/** Text to speech using server proxy (Groq TTS) or browser fallback */
export async function textToSpeech(
  text: string,
  _apiKeyUnused?: string,
  language: "auto" | "zh" | "en" = "auto",
): Promise<void> {
  // Pick voice based on language preference
  const voice = language === "zh" ? "Fritz-PlayAI" : "Arista-PlayAI"

  // Try server proxy (keys are injected server-side)
  try {
    const authToken = await getAuthToken()
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`
    }

    const res = await fetch("/api/audio/speech", {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: text.slice(0, 4096),
        voice,
      }),
    })
    if (res.ok) {
      const audioBlob = await res.blob()
      await playAudioBlob(audioBlob)
      return
    }
  } catch {
    // Proxy failed — try browser fallback
  }

  // Browser SpeechSynthesis fallback
  if ("speechSynthesis" in window) {
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 4096))
      utterance.rate = 1.0
      utterance.pitch = 1.0
      if (language === "zh") utterance.lang = "zh-TW"
      else if (language === "en") utterance.lang = "en-US"
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
  }
}

/** Play an audio blob via HTML5 Audio */
export function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Audio playback failed"))
    }
    audio.play().catch(reject)
  })
}

/** Check if browser supports speech recognition */
export function hasSpeechRecognition(): boolean {
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  )
}

/** Browser-based speech recognition fallback */
export function browserTranscribe(): Promise<string> {
  return new Promise((resolve, reject) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      reject(new Error("SpeechRecognition not supported"))
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      resolve(transcript)
    }
    recognition.onerror = (event: any) => {
      reject(new Error(event.error))
    }
    recognition.onend = () => {
      // If no result was fired, resolve empty
    }

    recognition.start()
  })
}
