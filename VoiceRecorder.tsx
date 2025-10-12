import React, { useState, useRef, useEffect } from 'react'
import { Mic, Square, Send, Loader, CreditCard as Edit3, Check, X, Trash2, MessageSquare } from 'lucide-react'

interface VoiceRecorderProps {
  onTranscriptionComplete: (text: string, language: string) => void
  isProcessing: boolean
  className?: string
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  language?: string
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

// Language detection patterns
const LANGUAGE_PATTERNS = {
  'en': /^(hello|hi|hey|what|how|can|help|doctor|health|pain|sick|feel|symptoms?|problem)/i,
  'es': /^(hola|buenos|qué|cómo|puedes?|ayuda|doctor|salud|dolor|enfermo|síntomas?|problema)/i,
  'fr': /^(bonjour|salut|qu'est|comment|pouvez|aide|docteur|santé|douleur|malade|symptômes?|problème)/i,
  'de': /^(hallo|guten|was|wie|können|hilfe|arzt|gesundheit|schmerz|krank|symptome?|problem)/i,
  'it': /^(ciao|buongiorno|cosa|come|puoi|aiuto|dottore|salute|dolore|malato|sintomi?|problema)/i,
  'pt': /^(olá|bom|o que|como|pode|ajuda|doutor|saúde|dor|doente|sintomas?|problema)/i,
  'hi': /^(नमस्ते|हैलो|क्या|कैसे|मदद|डॉक्टर|स्वास्थ्य|दर्द|बीमार|लक्षण)/i,
  'ar': /^(مرحبا|السلام|ما|كيف|مساعدة|طبيب|صحة|ألم|مريض|أعراض)/i,
  'zh': /^(你好|您好|什么|怎么|帮助|医生|健康|疼痛|生病|症状)/i,
  'ja': /^(こんにちは|何|どう|助け|医者|健康|痛み|病気|症状)/i,
  'ko': /^(안녕|무엇|어떻게|도움|의사|건강|아픔|아픈|증상)/i,
  'ru': /^(привет|что|как|помощь|врач|здоровье|боль|больной|симптомы)/i
}

type RecordingState = 'START' | 'STOP' | 'REVIEW' | 'EDIT'

export default function VoiceRecorder({ onTranscriptionComplete, isProcessing, className = '' }: VoiceRecorderProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('START')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [completeTranscript, setCompleteTranscript] = useState('')
  const [editedTranscript, setEditedTranscript] = useState('')
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [audioLevel, setAudioLevel] = useState(0)
  const [detectedLanguage, setDetectedLanguage] = useState('en')
  const [error, setError] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showFullHistory, setShowFullHistory] = useState(false)
  const [tokenCount, setTokenCount] = useState(0)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [showTranscriptWindow, setShowTranscriptWindow] = useState(false)
  
  // Enhanced refs for better voice capture
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recognitionRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const historyScrollRef = useRef<HTMLDivElement>(null)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Complete transcript accumulator - this fixes the buffer limitation
  const completeTranscriptRef = useRef<string>('')
  const finalTranscriptPartsRef = useRef<string[]>([])

  // Estimate token count for conversation
  const estimateTokens = (messages: ConversationMessage[]): number => {
    const totalText = messages.map(msg => msg.content).join(' ')
    return Math.ceil(totalText.length / 4) // Rough estimation: 1 token ≈ 4 characters
  }

  // Add message to conversation history
  const addToConversationHistory = (role: 'user' | 'assistant', content: string, language?: string) => {
    const newMessage: ConversationMessage = {
      role,
      content,
      timestamp: new Date(),
      language
    }
    
    setConversationHistory(prev => {
      const updated = [...prev, newMessage]
      const tokens = estimateTokens(updated)
      setTokenCount(tokens)
      
      // If exceeding 8000 tokens, summarize older messages
      if (tokens > 8000) {
        return summarizeConversation(updated)
      }
      
      return updated
    })
  }

  // Summarize conversation when token limit is reached
  const summarizeConversation = (messages: ConversationMessage[]): ConversationMessage[] => {
    if (messages.length <= 15) return messages
    
    // Keep last 15 messages in full detail
    const recentMessages = messages.slice(-15)
    const olderMessages = messages.slice(0, -15)
    
    // Create summary of older messages
    const summaryContent = `[Previous conversation summary: User discussed ${
      olderMessages.filter(m => m.role === 'user').length
    } health concerns with AI responses. Key topics covered in earlier conversation.]`
    
    const summaryMessage: ConversationMessage = {
      role: 'assistant',
      content: summaryContent,
      timestamp: olderMessages[0]?.timestamp || new Date(),
      language: 'en'
    }
    
    return [summaryMessage, ...recentMessages]
  }

  // Clear entire conversation history
  const clearConversationHistory = () => {
    setConversationHistory([])
    setTokenCount(0)
    setShowFullHistory(false)
    // Also clear current transcript
    setLiveTranscript('')
    setCompleteTranscript('')
    setEditedTranscript('')
    completeTranscriptRef.current = ''
    finalTranscriptPartsRef.current = []
  }

  // Get conversation context for AI
  const getConversationContext = (): ConversationMessage[] => {
    return conversationHistory
  }

  const detectLanguage = (text: string): string => {
    for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
      if (pattern.test(text.trim())) {
        return lang
      }
    }
    return 'en' // Default to English
  }

  const startRecording = async () => {
    try {
      setError('')
      setLiveTranscript('')
      setCompleteTranscript('')
      setEditedTranscript('')
      setRecordingDuration(0)
      
      // Reset transcript accumulators
      completeTranscriptRef.current = ''
      finalTranscriptPartsRef.current = []
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      })
      streamRef.current = stream
      
      // Set up audio analysis for visual feedback
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      
      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
      
      // Start audio level monitoring
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      const updateAudioLevel = () => {
        if (analyserRef.current && recordingState === 'STOP') {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length
          setAudioLevel(average / 255)
          requestAnimationFrame(updateAudioLevel)
        }
      }
      updateAudioLevel()

      // Set up MediaRecorder for high-quality recording
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      }
      
      try {
        mediaRecorderRef.current = new MediaRecorder(stream, options)
      } catch (e) {
        // Fallback for browsers that don't support the preferred format
        mediaRecorderRef.current = new MediaRecorder(stream)
      }
      
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      // Enhanced Web Speech API setup for continuous recognition
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
        recognitionRef.current = new SpeechRecognition()
        
        // Enhanced settings for better continuous recognition
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        recognitionRef.current.maxAlternatives = 1
        recognitionRef.current.lang = 'auto'

        recognitionRef.current.onresult = (event: any) => {
          let interimTranscript = ''
          
          // Process all results to build complete transcript
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            
            if (event.results[i].isFinal) {
              // Add final result to our accumulator
              finalTranscriptPartsRef.current.push(transcript)
              completeTranscriptRef.current = finalTranscriptPartsRef.current.join(' ')
            } else {
              interimTranscript += transcript
            }
          }

          // Combine complete transcript with current interim results
          const fullTranscript = completeTranscriptRef.current + (interimTranscript ? ' ' + interimTranscript : '')
          setLiveTranscript(fullTranscript.trim())
          
          if (fullTranscript.trim()) {
            const language = detectLanguage(fullTranscript)
            setDetectedLanguage(language)
          }
        }

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error)
          if (event.error === 'no-speech') {
            // Don't show error for no-speech, just continue
            return
          }
          if (event.error === 'aborted') {
            // Don't show error for aborted, it's a normal lifecycle event
            return
          }
          setError(`Speech recognition error: ${event.error}`)
        }

        recognitionRef.current.onend = () => {
          // If we're still recording, restart recognition to maintain continuity
          if (recordingState === 'STOP' && recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch (e) {
              console.log('Recognition restart failed:', e)
            }
          }
        }

        recognitionRef.current.start()
      }

      // Start MediaRecorder with small time slices for better real-time processing
      mediaRecorderRef.current.start(1000) // 1 second slices
      setRecordingState('STOP')
      setShowTranscriptWindow(true) // Show transcript window when recording starts
    } catch (err) {
      setError('Microphone access denied. Please allow microphone permissions.')
      console.error('Error accessing microphone:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'STOP') {
      mediaRecorderRef.current.stop()
      
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
      
      setAudioLevel(0)
      
      // Use the complete accumulated transcript
      const finalTranscript = completeTranscriptRef.current.trim() || liveTranscript.trim()
      setCompleteTranscript(finalTranscript)
      setEditedTranscript(finalTranscript)
      setRecordingState('REVIEW')
      // Keep transcript window visible for review
    }
  }

  const startEditing = () => {
    setIsEditing(true)
    setRecordingState('EDIT')
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(editedTranscript.length, editedTranscript.length)
      }
    }, 100)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditedTranscript(completeTranscript)
    setRecordingState('REVIEW')
  }

  const saveEditing = () => {
    setIsEditing(false)
    setCompleteTranscript(editedTranscript)
    setRecordingState('REVIEW')
  }

  const sendTranscript = async () => {
    const textToSend = editedTranscript.trim() || completeTranscript.trim()
    
    if (textToSend) {
      // Add user message to conversation history
      addToConversationHistory('user', textToSend, detectedLanguage)
      
      // Send to parent component with full conversation context
      onTranscriptionComplete(textToSend, detectedLanguage)
      
      // Auto-removal: Close transcript window after successful send
      setTimeout(() => {
        resetRecorder() // This will hide the window and reset state
      }, 500) // Small delay for smooth transition
    } else if (audioChunksRef.current.length > 0) {
          
          // Auto-removal: Close transcript window after successful send
          setTimeout(() => {
            resetRecorder()
          }, 500)
      setIsTranscribing(true)
      try {
          // Don't auto-close on error - let user try again
        await transcribeWithWhisper(audioBlob)
      } catch (err) {
        setError('Failed to transcribe audio. Please try again.')
        console.error('Transcription error:', err)
        // Don't auto-close on error - let user try again
        setIsTranscribing(false)
      }
    } else {
      setError('No audio recorded. Please try again.')
      resetRecorder()
    }
  }

  const transcribeWithWhisper = async (audioBlob: Blob) => {
    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.webm')
      formData.append('model', 'whisper-1')
      formData.append('language', detectedLanguage)

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`)
      }

      const data = await response.json()
      const transcribedText = data.text

      if (transcribedText.trim()) {
        const language = detectLanguage(transcribedText)
        setDetectedLanguage(language)
        addToConversationHistory('user', transcribedText, language)
        onTranscriptionComplete(transcribedText, language)
        resetRecorder()
      } else {
        setError('No speech detected. Please try again.')
        resetRecorder()
      }
    } catch (err) {
      setError('Failed to transcribe audio. Please try again.')
      console.error('Transcription error:', err)
      // Don't auto-close on error - let user try again
    }
  }

  const resetRecorder = () => {
    setRecordingState('START')
    setLiveTranscript('')
    setCompleteTranscript('')
    setEditedTranscript('')
    setAudioLevel(0)
    setError('')
    setIsEditing(false)
    setRecordingDuration(0)
    setShowTranscriptWindow(false) // Hide transcript window when resetting
    audioChunksRef.current = []
    completeTranscriptRef.current = ''
    finalTranscriptPartsRef.current = []
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
    }
  }

  // Scroll to bottom of history when new messages are added
  useEffect(() => {
    if (historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight
    }
  }, [conversationHistory])

  // Add AI response to conversation history (called from parent)
  useEffect(() => {
    // This will be called from parent component when AI responds
    const handleAIResponse = (response: string) => {
      addToConversationHistory('assistant', response, detectedLanguage)
    }
    
    // Expose function to parent component
    ;(window as any).addAIResponseToHistory = handleAIResponse
    
    return () => {
      delete (window as any).addAIResponseToHistory
    }
  }, [detectedLanguage])

  const handleButtonClick = () => {
    if (isProcessing || isTranscribing) return

    switch (recordingState) {
      case 'START':
        startRecording()
        break
      case 'STOP':
        stopRecording()
        break
      case 'REVIEW':
        sendTranscript()
        break
      case 'EDIT':
        // Button is disabled in edit mode
        break
    }
  }

  const getButtonConfig = () => {
    switch (recordingState) {
      case 'START':
        return {
          icon: Mic,
          color: 'from-blue-500 to-purple-500',
          hoverColor: 'from-blue-600 to-purple-600',
          label: 'Start Recording'
        }
      case 'STOP':
        return {
          icon: Square,
          color: 'from-red-500 to-pink-500',
          hoverColor: 'from-red-600 to-pink-600',
          label: 'Stop Recording'
        }
      case 'REVIEW':
      case 'EDIT':
        return {
          icon: Send,
          color: 'from-green-500 to-emerald-500',
          hoverColor: 'from-green-600 to-emerald-600',
          label: 'Send Transcript'
        }
    }
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const buttonConfig = getButtonConfig()
  const ButtonIcon = buttonConfig.icon

  return (
    <div className={`relative ${className}`}>
      {/* Enhanced Transcript Display - Horizontally Expanded with Auto-Removal */}
      {showTranscriptWindow && (recordingState !== 'START' || conversationHistory.length > 0) && (
        <div className="absolute bottom-16 right-0 left-0 mb-2 transition-all duration-500 ease-in-out">
          {/* Horizontally Expanded Rectangular Window - 1.5-2x wider than height */}
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200 dark:border-gray-600 max-h-[24rem] w-full max-w-4xl mx-auto overflow-hidden transform transition-all duration-300">
            {/* Header with Controls */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {recordingState === 'STOP' ? `Live Transcript (${formatDuration(recordingDuration)})` : 'Voice Conversation'}
                  {detectedLanguage !== 'en' && ` (${detectedLanguage.toUpperCase()})`}
                </span>
                {recordingState === 'STOP' && (
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-red-500 font-medium">Recording</span>
                  </div>
                )}
                {tokenCount > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    ({tokenCount} tokens)
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                {conversationHistory.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowFullHistory(!showFullHistory)}
                      className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                    >
                      {showFullHistory ? 'Collapse' : 'Expand'}
                    </button>
                    <button
                      onClick={clearConversationHistory}
                      className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  </>
                )}
                
                {/* Manual Close Button */}
                <button
                  onClick={() => setShowTranscriptWindow(false)}
                  className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title="Close transcript window"
                >
                  ✕
                </button>
                
                {recordingState === 'REVIEW' && !isEditing && (
                  <button
                    onClick={startEditing}
                    className="flex items-center space-x-1 px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            </div>

            {/* Full Conversation History - Horizontally Optimized Display */}
            {conversationHistory.length > 0 && (
              <div 
                ref={historyScrollRef}
                className={`border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30 overflow-y-auto ${
                  showFullHistory ? 'max-h-48' : 'max-h-32'
                }`}
              >
                <div className="p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
                    Conversation History ({conversationHistory.length} messages):
                  </div>
                  {/* Horizontal layout for better space utilization */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {conversationHistory.map((msg, index) => (
                      <div 
                        key={index} 
                        className={`text-xs p-3 rounded-lg transition-all duration-200 hover:shadow-sm ${
                          msg.role === 'user' 
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' 
                            : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                        }`}
                      >
                        <div className="font-medium mb-1 flex items-center justify-between">
                          {msg.role === 'user' ? '🎤 You' : '🤖 AI'} 
                          {msg.language && msg.language !== 'en' && ` (${msg.language.toUpperCase()})`}
                          <span className="text-gray-500 dark:text-gray-400 text-xs">
                            {msg.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="leading-relaxed">
                          {msg.content.length > 200 && !showFullHistory 
                            ? `${msg.content.substring(0, 200)}...` 
                            : msg.content
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Current Transcript - Horizontally Optimized Display */}
            <div className="p-4 max-h-48 overflow-y-auto">
              {recordingState === 'STOP' && (
                <div className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed min-h-[6rem]">
                  <div className="font-medium text-blue-600 dark:text-blue-400 mb-2 flex items-center justify-between">
                    <span>Current Recording:</span>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span>LIVE</span>
                      </span>
                      Duration: {formatDuration(recordingDuration)} | 
                      Words: {liveTranscript.split(' ').filter(w => w.length > 0).length}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg min-h-[4rem] whitespace-pre-wrap border-l-4 border-blue-400">
                    {liveTranscript || 'Listening for speech...'}
                  </div>
                </div>
              )}
              
              {(recordingState === 'REVIEW' || recordingState === 'EDIT') && (
                <div className="space-y-3">
                  <div className="font-medium text-green-600 dark:text-green-400 mb-2 flex items-center justify-between">
                    <span>Ready to Send:</span>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full">Ready</span>
                      Words: {(editedTranscript || completeTranscript).split(' ').filter(w => w.length > 0).length}
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="space-y-3">
                      {/* Enhanced editing interface with horizontal layout */}
                      <textarea
                        ref={textareaRef}
                        value={editedTranscript}
                        onChange={(e) => setEditedTranscript(e.target.value)}
                        className="w-full p-4 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-l-4 border-yellow-400"
                        rows={4}
                        placeholder="Edit your transcript..."
                      />
                      <div className="flex space-x-3 justify-end">
                        <button
                          onClick={saveEditing}
                          className="flex items-center space-x-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-all duration-200 text-sm font-medium transform hover:scale-105"
                        >
                          <Check className="w-4 h-4" />
                          <span>Save</span>
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 text-sm font-medium"
                        >
                          <X className="w-4 h-4" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed min-h-[4rem] p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg whitespace-pre-wrap border-l-4 border-green-400">
                      {editedTranscript || completeTranscript || 'Ready to send'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="absolute bottom-16 right-0 left-0 mb-2">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 max-w-2xl mx-auto transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">{error}</p>
              </div>
              <button 
                onClick={() => setError('')}
                className="text-red-500 hover:text-red-700 dark:hover:text-red-300 ml-2 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Recording Button */}
      <button
        onClick={handleButtonClick}
        disabled={isProcessing || isTranscribing || isEditing}
        className={`relative p-3 bg-gradient-to-r ${buttonConfig.color} hover:${buttonConfig.hoverColor} text-white rounded-2xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:transform-none shadow-lg hover:shadow-xl ${
          recordingState === 'STOP' ? 'animate-pulse' : ''
        }`}
        aria-label={buttonConfig.label}
        title={buttonConfig.label}
      >
        {isTranscribing ? (
          <Loader className="w-5 h-5 animate-spin" />
        ) : (
          <ButtonIcon className="w-5 h-5" />
        )}

        {/* Audio Level Visualization for STOP state */}
        {recordingState === 'STOP' && (
          <div 
            className="absolute inset-0 rounded-2xl border-4 border-red-400 animate-pulse"
            style={{
              transform: `scale(${1 + audioLevel * 0.3})`,
              opacity: 0.6 + audioLevel * 0.4
            }}
          />
        )}

        {/* Processing Indicator */}
        {(isProcessing || isTranscribing) && (
          <div className="absolute inset-0 rounded-2xl border-4 border-yellow-400 animate-spin border-t-transparent" />
        )}
      </button>
    </div>
  )
}