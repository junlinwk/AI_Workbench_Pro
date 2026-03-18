/**
 * Audio client — STT (Whisper) and TTS via Groq or browser fallback
 *
 * Strategy:
 * 1. Try direct Groq API (CORS may allow it)
 * 2. Fall back to /api/audio/* proxy
 * 3. Fall back to browser built-in SpeechRecognition / SpeechSynthesis
 */

/** Transcribe audio blob to text using Groq Whisper */
export async function transcribeAudio(
  blob: Blob,
  apiKey: string,
): Promise<string> {
  // Try direct Groq API first
  try {
    const formData = new FormData()
    formData.append("file", blob, "recording.webm")
    formData.append("model", "whisper-large-v3-turbo")
    formData.append("language", "auto")

    const res = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      },
    )
    if (res.ok) {
      const data = await res.json()
      return data.text || ""
    }
  } catch {
    // CORS blocked — try proxy
  }

  // Proxy fallback
  try {
    const reader = new FileReader()
    const base64 = await new Promise<string>((resolve) => {
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(",")[1] || "")
      }
      reader.readAsDataURL(blob)
    })

    const res = await fetch("/api/audio/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: base64, apiKey }),
    })
    if (res.ok) {
      const data = await res.json()
      return data.text || ""
    }
  } catch {
    // Proxy also failed
  }

  throw new Error("transcription_failed")
}

/** Text to speech using Groq TTS or browser fallback */
export async function textToSpeech(
  text: string,
  apiKey?: string,
): Promise<void> {
  if (apiKey) {
    // Try direct Groq TTS
    try {
      const res = await fetch(
        "https://api.groq.com/openai/v1/audio/speech",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "playai-tts",
            input: text.slice(0, 4096),
            voice: "Arista-PlayAI",
            response_format: "wav",
          }),
        },
      )
      if (res.ok) {
        const audioBlob = await res.blob()
        await playAudioBlob(audioBlob)
        return
      }
    } catch {
      // CORS blocked — try proxy
    }

    // Proxy fallback
    try {
      const res = await fetch("/api/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, 4096),
          apiKey,
        }),
      })
      if (res.ok) {
        const audioBlob = await res.blob()
        await playAudioBlob(audioBlob)
        return
      }
    } catch {
      // Proxy also failed
    }
  }

  // Browser SpeechSynthesis fallback
  if ("speechSynthesis" in window) {
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 4096))
      utterance.rate = 1.0
      utterance.pitch = 1.0
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
