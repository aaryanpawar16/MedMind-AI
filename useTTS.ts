import { useState, useRef } from 'react'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

const VOICE_MAPPING = {
  'en': 'alloy',
  'es': 'nova',
  'fr': 'shimmer',
  'de': 'echo',
  'it': 'fable',
  'pt': 'onyx',
  'hi': 'alloy',
  'ar': 'alloy',
  'zh': 'alloy',
  'ja': 'alloy',
  'ko': 'alloy',
  'ru': 'alloy'
}

export const useTTS = () => {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState('')
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)

  const speak = async (text: string, language: string = 'en') => {
    try {
      setIsSpeaking(true)
      setError('')
      
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }

      const voice = VOICE_MAPPING[language as keyof typeof VOICE_MAPPING] || 'alloy'
      
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voice,
          speed: 1.0
        })
      })

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`)
      }

      const audioBuffer = await response.arrayBuffer()
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)
      
      const audio = new Audio(audioUrl)
      currentAudioRef.current = audio
      
      return new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          setIsSpeaking(false)
          URL.revokeObjectURL(audioUrl)
          currentAudioRef.current = null
          resolve()
        }
        
        audio.onerror = () => {
          setIsSpeaking(false)
          setError('Failed to play audio response.')
          URL.revokeObjectURL(audioUrl)
          currentAudioRef.current = null
          reject(new Error('Audio playback failed'))
        }
        
        audio.play().catch(reject)
      })
    } catch (err) {
      setIsSpeaking(false)
      setError('Failed to generate speech. Please try again.')
      console.error('TTS error:', err)
      throw err
    }
  }

  const stop = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
      setIsSpeaking(false)
    }
  }

  return {
    speak,
    stop,
    isSpeaking,
    error
  }
}