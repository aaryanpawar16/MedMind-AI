import React, { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Loader, FileText, Upload, X, Download, Share2, Calendar, Stethoscope, History, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import OpenAI from 'openai'
import jsPDF from 'jspdf'
import { v4 as uuidv4 } from 'uuid'
import VoiceRecorder from './VoiceRecorder'
import { useTTS } from '../hooks/useTTS'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  files?: File[]
}

interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

interface UserProfileData {
  full_name: string
  age: number
  gender: string
  past_medical_history?: string
  tobacco_use: boolean
  current_medications?: string
}

interface Prescription {
  patientName: string
  date: string
  symptoms: string
  diagnosis: string
  medications: string
  advice?: string
  followUp?: string
  doctor: string
}

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

const SYSTEM_PROMPT = `System Prompt for MedMind AI (AI Health Assistant with Report Analysis)
You are MedMind AI, a digital health assistant. You are speaking with {USER_NAME}, a {AGE}-year-old {GENDER}. Always address them by their name and consider their medical profile when providing advice.

After collecting the user's symptoms, vitals, or uploaded reports, you must generate a complete and medically sound prescription.

Use the following structure when rendering a prescription:

Patient Name: {USER_NAME}
Date: [Auto-generated]

Reported Symptoms:
[List in natural language]

Diagnosis Summary:
[A sentence summarizing the likely condition, e.g., "Likely viral upper respiratory infection based on fever and cough."]

Recommended Medications:
Paracetamol 500mg – 1 tablet every 6 hours for 3 days (for fever)
Cough Syrup XYZ – 5ml twice a day after meals (for dry cough)
Vitamin C – once daily for 7 days

General Advice:
Drink plenty of warm fluids
Rest well
Monitor temperature 3x daily
Isolate if symptoms worsen

Follow-Up:
If symptoms persist beyond 3 days or worsen, consult a doctor.

Doctor: AI-Powered by MedMind
Note: This is an AI-generated prescription based on your input. Please consult a licensed physician for verification.

At the end of the consultation, render this prescription in a clean card UI, and display buttons:
- Download PDF
- Share via WhatsApp

Do not use markdown or formatting characters (#, *, etc). Use plain, professional language like a human doctor. Keep the tone empathetic and supportive.

Core Capabilities:
- Greet the user warmly and respectfully
- Accept uploaded medical reports (e.g., blood tests, scans, prescriptions) and analyze them using medical knowledge
- Explain the possible meanings of test results or diagnoses in simple, layman-friendly language
- If patterns match known conditions, suggest likely causes, and provide educational information about them
- Suggest commonly used medications or treatments, always recommending doctor approval
- Help with mental wellness, general symptoms, and lifestyle improvements

Limitations & Ethical Rules:
- Never claim to replace a licensed medical professional
- For serious issues or emergencies, say: "Please consult a doctor or visit the hospital immediately"
- Never guess when data is unclear or missing. Ask follow-up questions politely
- Treat all user input as confidential. Use a gentle tone and never make users feel judged
- Goal: Help users understand their health better while encouraging professional medical guidance`

export default function MyDoc() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [showPrescription, setShowPrescription] = useState(false)
  const [currentPrescription, setCurrentPrescription] = useState<Prescription | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isFirstInteraction, setIsFirstInteraction] = useState(true)
  const { speak: speakTTS, isSpeaking } = useTTS()
  const [voiceLanguage, setVoiceLanguage] = useState('en')

  useEffect(() => {
    fetchUserProfile()
    loadChatHistory()
    initializeOrRestoreSession()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Auto-save when messages change or component unmounts
  useEffect(() => {
    if (currentSessionId && messages.length > 1 && isInitialized) {
      const timeoutId = setTimeout(() => {
        saveCurrentSession()
      }, 1000) // Debounce saves
      
      return () => clearTimeout(timeoutId)
    }
  }, [messages, currentSessionId, isInitialized])

  // Save session when component unmounts
  useEffect(() => {
    return () => {
      if (currentSessionId && messages.length > 1) {
        saveCurrentSession()
      }
    }
  }, [])

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_profiles')
        .select('full_name, age, gender, past_medical_history, tobacco_use, current_medications')
        .eq('user_id', user.id)
        .single()

      if (error) {
        console.error('Error fetching profile:', error)
        return
      }

      setUserProfile(data)
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const loadChatHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'medical')
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('Error loading chat history:', error)
        return
      }

      const sessions = data.map((session: any) => ({
        id: session.id,
        title: session.title,
        messages: session.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })),
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at)
      }))
      
      setChatSessions(sessions)
    } catch (err) {
      console.error('Error loading chat history:', err)
    }
  }

  const saveChatHistory = async (sessions: ChatSession[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Save current session to Supabase
      const currentSession = sessions.find(s => s.id === currentSessionId)
      if (currentSession && currentSession.messages.length > 1) {
        const { error } = await supabase
          .from('chat_sessions')
          .upsert({
            id: currentSession.id,
            user_id: user.id,
            title: currentSession.title,
            type: 'medical',
            messages: currentSession.messages,
            updated_at: new Date().toISOString()
          })

        if (error) {
          console.error('Error saving chat session:', error)
        }
      }
    } catch (err) {
      console.error('Error saving chat history:', err)
    }
  }

  const initializeOrRestoreSession = async () => {
    // Try to restore the last active session from localStorage
    const savedSessionId = localStorage.getItem('myDoc_currentSessionId')
    const savedMessages = localStorage.getItem('myDoc_currentMessages')
    
    // Validate if savedSessionId is a valid UUID
    const isValidUUID = (str: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      return uuidRegex.test(str)
    }
    
    if (savedSessionId && savedMessages) {
      // Check if savedSessionId is a valid UUID
      if (!isValidUUID(savedSessionId)) {
        // Clear invalid session data and start fresh
        localStorage.removeItem('myDoc_currentSessionId')
        localStorage.removeItem('myDoc_currentMessages')
        startNewSession()
        return
      }
      
      try {
        const parsedMessages = JSON.parse(savedMessages)
        setCurrentSessionId(savedSessionId)
        setMessages(parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })))
        setIsInitialized(true)
        return
      } catch (error) {
        console.error('Error restoring session:', error)
        // Clear corrupted session data and start fresh
        localStorage.removeItem('myDoc_currentSessionId')
        localStorage.removeItem('myDoc_currentMessages')
      }
    }
    
    // If no saved session, start new one
    startNewSession()
  }

  const startNewSession = () => {
    const newSessionId = uuidv4()
    setCurrentSessionId(newSessionId)
    const initialMessages = [{
      id: uuidv4(),
      role: 'assistant',
      content: 'Hello! I\'m MedMind AI, your personal health assistant. I have access to your medical profile and I\'m here to help you with any health-related questions or concerns. You can describe your symptoms, upload medical reports, or ask any health questions. How can I assist you today? ✨',
      timestamp: new Date()
    }]
    setMessages(initialMessages)
    setIsInitialized(true)
    
    // Save to localStorage for persistence
    localStorage.setItem('myDoc_currentSessionId', newSessionId)
    localStorage.setItem('myDoc_currentMessages', JSON.stringify(initialMessages))
  }

  const saveCurrentSession = () => {
    if (!currentSessionId || messages.length <= 1) return

    const sessionTitle = generateSessionTitle(messages)
    const newSession: ChatSession = {
      id: currentSessionId,
      title: sessionTitle,
      messages: [...messages],
      createdAt: messages[0]?.timestamp || new Date(),
      updatedAt: new Date()
    }

    setChatSessions(prev => {
      const existingIndex = prev.findIndex(s => s.id === currentSessionId)
      let updatedSessions
      if (existingIndex >= 0) {
        updatedSessions = [...prev]
        updatedSessions[existingIndex] = newSession
      } else {
        updatedSessions = [newSession, ...prev]
      }
      saveChatHistory(updatedSessions)
      return updatedSessions
    })
  }

  // Save current state to localStorage whenever messages change
  useEffect(() => {
    if (currentSessionId && messages.length > 0 && isInitialized) {
      localStorage.setItem('myDoc_currentSessionId', currentSessionId)
      localStorage.setItem('myDoc_currentMessages', JSON.stringify(messages))
    }
  }, [messages, currentSessionId, isInitialized])

  const generateSessionTitle = (messages: Message[]): string => {
    const userMessage = messages.find(m => m.role === 'user')
    if (userMessage) {
      const content = userMessage.content.slice(0, 50)
      return content.length < userMessage.content.length ? content + '...' : content
    }
    return `Chat ${new Date().toLocaleDateString()}`
  }

  const loadSession = (session: ChatSession) => {
    if (currentSessionId && messages.length > 1) {
      saveCurrentSession() // Save current session before switching
    }
    setCurrentSessionId(session.id)
    setMessages(session.messages)
    setShowHistory(false)
    
    // Update localStorage
    localStorage.setItem('myDoc_currentSessionId', session.id)
    localStorage.setItem('myDoc_currentMessages', JSON.stringify(session.messages))
  }

  const deleteSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId)

      if (error) {
        console.error('Error deleting session:', error)
        return
      }

      setChatSessions(prev => prev.filter(s => s.id !== sessionId))
      
      if (currentSessionId === sessionId) {
        // Clear localStorage and start new session
        localStorage.removeItem('myDoc_currentSessionId')
        localStorage.removeItem('myDoc_currentMessages')
        startNewSession()
      }
    } catch (err) {
      console.error('Error deleting session:', err)
    }
  }

  const createConversationContext = (): string => {
    let context = ''
    
    // Add recent conversation history from current session
    const recentMessages = messages.slice(-10) // Last 10 messages
    if (recentMessages.length > 1) {
      context += '\n\nRecent conversation context:\n'
      recentMessages.forEach(msg => {
        if (msg.role === 'user') {
          context += `Patient: ${msg.content}\n`
        } else if (msg.role === 'assistant' && !msg.content.includes('Hello! I\'m MedMind AI')) {
          context += `AI: ${msg.content.slice(0, 200)}...\n`
        }
      })
    }

    // Add relevant history from previous sessions
    const relevantSessions = chatSessions
      .filter(s => s.id !== currentSessionId)
      .slice(0, 3) // Last 3 sessions
      .reverse()

    if (relevantSessions.length > 0) {
      context += '\n\nPrevious consultation history (for context):\n'
      relevantSessions.forEach(session => {
        const userMessages = session.messages.filter(m => m.role === 'user')
        const assistantMessages = session.messages.filter(m => m.role === 'assistant' && !m.content.includes('Hello! I\'m MedMind AI'))
        
        if (userMessages.length > 0) {
          context += `\nSession ${session.createdAt.toLocaleDateString()}:\n`
          context += `Patient concerns: ${userMessages.map(m => m.content.slice(0, 100)).join(', ')}\n`
          if (assistantMessages.length > 0) {
            context += `Previous diagnosis/advice: ${assistantMessages[0].content.slice(0, 150)}...\n`
          }
        }
      })
    }

    return context
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const createUserContext = () => {
    if (!userProfile) return ''
    
    return `
User Profile Context:
- Name: ${userProfile.full_name}
- Age: ${userProfile.age}
- Gender: ${userProfile.gender}
- Past Medical History: ${userProfile.past_medical_history || 'None provided'}
- Tobacco Use: ${userProfile.tobacco_use ? 'Yes' : 'No'}
- Current Medications: ${userProfile.current_medications || 'None provided'}

Always address the user by their name (${userProfile.full_name}) and provide personalized health advice based on their profile.`
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter(file => {
      const isValidType = file.type.includes('image/') || file.type === 'application/pdf'
      const isValidSize = file.size <= 10 * 1024 * 1024 // 10MB limit
      return isValidType && isValidSize
    })
    
    setSelectedFiles(prev => [...prev, ...validFiles])
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const extractPrescriptionData = (aiResponse: string): Prescription | null => {
    if (!userProfile) return null

    const symptomsMatch = aiResponse.match(/Reported Symptoms:\s*(.*?)(?=\n\n|Diagnosis Summary:|$)/s)
    const diagnosisMatch = aiResponse.match(/Diagnosis Summary:\s*(.*?)(?=\n\n|Recommended Medications:|$)/s)
    const medicationMatch = aiResponse.match(/Recommended Medications:\s*(.*?)(?=\n\n|General Advice:|$)/s)
    const adviceMatch = aiResponse.match(/General Advice:\s*(.*?)(?=\n\n|Follow-Up:|$)/s)
    const followUpMatch = aiResponse.match(/Follow-Up:\s*(.*?)(?=\n\n|Doctor:|$)/s)

    return {
      patientName: userProfile.full_name,
      date: new Date().toLocaleDateString(),
      symptoms: symptomsMatch?.[1]?.trim() || inputMessage,
      diagnosis: diagnosisMatch?.[1]?.trim() || 'Based on symptoms analysis',
      medications: medicationMatch?.[1]?.trim() || 'As discussed in consultation',
      advice: adviceMatch?.[1]?.trim() || 'Follow general health guidelines',
      followUp: followUpMatch?.[1]?.trim() || 'Consult doctor if symptoms persist',
      doctor: 'AI-Powered by MedMind'
    }
  }

  const sendMessage = async () => {
    if ((!inputMessage.trim() && selectedFiles.length === 0) || loading) return

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: inputMessage || 'Uploaded medical files for analysis',
      timestamp: new Date(),
      files: selectedFiles.length > 0 ? [...selectedFiles] : undefined
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = inputMessage
    setInputMessage('')
    setSelectedFiles([])
    setLoading(true)

    try {
      let messageContent = currentInput
      if (selectedFiles.length > 0) {
        messageContent += `\n\nI have uploaded ${selectedFiles.length} medical file(s): ${selectedFiles.map(f => f.name).join(', ')}. Please analyze these files along with my symptoms.`
      }

      const conversationContext = createConversationContext()

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: SYSTEM_PROMPT
              .replace('{USER_NAME}', userProfile?.full_name || 'Patient')
              .replace('{AGE}', userProfile?.age?.toString() || 'unknown')
              .replace('{GENDER}', userProfile?.gender || 'unknown') + 
              '\n\n' + createUserContext() + conversationContext 
          },
          { role: 'user', content: messageContent }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })

      const assistantResponse = response.choices[0]?.message?.content || 'I apologize, but I encountered an error. Please try again.'

      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

      if (assistantResponse.includes('Patient Name:') || 
          assistantResponse.includes('Recommended Medications:') || 
          assistantResponse.toLowerCase().includes('prescription')) {
        const prescriptionData = extractPrescriptionData(assistantResponse)
        if (prescriptionData) {
          setCurrentPrescription(prescriptionData)
        }
      }

      // Auto-speak the response if it came from voice input
      if (voiceLanguage && voiceLanguage !== 'en') {
        try {
          await speakTTS(assistantResponse, voiceLanguage)
        } catch (error) {
          console.error('Failed to speak response:', error)
        }
      }

    } catch (error) {
      console.error('Error calling OpenAI:', error)
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: 'I apologize, but I\'m having trouble connecting right now. Please try again in a moment.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleVoiceTranscription = async (transcribedText: string, language: string) => {
    setVoiceLanguage(language)
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: transcribedText,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setLoading(true)

    try {
      const conversationContext = createConversationContext()

      // Enhanced system prompt for multilingual support with greeting control
      const multilingualPrompt = SYSTEM_PROMPT
        .replace('{USER_NAME}', userProfile?.full_name || 'Patient')
        .replace('{AGE}', userProfile?.age?.toString() || 'unknown')
        .replace('{GENDER}', userProfile?.gender || 'unknown') + 
        '\n\n' + createUserContext() + conversationContext +
        `\n\nIMPORTANT: The user is speaking in ${language.toUpperCase()}. Please respond in the same language (${language.toUpperCase()}) that the user used. Maintain natural, conversational tone as if you're a doctor speaking directly to the patient.` +
        (isFirstInteraction ? '' : '\n\nDO NOT greet the user again. This is a continuing conversation. Jump directly into addressing their medical concern.')

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: multilingualPrompt },
          { role: 'user', content: transcribedText }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })

      const assistantResponse = response.choices[0]?.message?.content || 'I apologize, but I encountered an error. Please try again.'

      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // Mark that first interaction is complete
      setIsFirstInteraction(false)
      
      // Add AI response to voice conversation history
      if ((window as any).addAIResponseToHistory) {
        (window as any).addAIResponseToHistory(assistantResponse)
      }

      // Extract prescription data if applicable
      if (assistantResponse.includes('Patient Name:') || 
          assistantResponse.includes('Recommended Medications:') || 
          assistantResponse.toLowerCase().includes('prescription')) {
        const prescriptionData = extractPrescriptionData(assistantResponse)
        if (prescriptionData) {
          setCurrentPrescription(prescriptionData)
        }
      }

      // Auto-speak the response
      try {
        await speakTTS(assistantResponse, language)
      } catch (error) {
        console.error('Failed to speak response:', error)
      }

    } catch (error) {
      console.error('Error calling OpenAI:', error)
      const errorMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: 'I apologize, but I\'m having trouble connecting right now. Please try again in a moment.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const generatePrescriptionPDF = () => {
    if (!currentPrescription) return

    const pdf = new jsPDF()
    
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    pdf.text('MEDICAL PRESCRIPTION', 105, 30, { align: 'center' })
    
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Patient: ${currentPrescription.patientName}`, 20, 60)
    pdf.text(`Date: ${currentPrescription.date}`, 20, 75)
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Symptoms:', 20, 95)
    pdf.setFont('helvetica', 'normal')
    const symptomsLines = pdf.splitTextToSize(currentPrescription.symptoms, 170)
    pdf.text(symptomsLines, 20, 110)
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Diagnosis:', 20, 140)
    pdf.setFont('helvetica', 'normal')
    const diagnosisLines = pdf.splitTextToSize(currentPrescription.diagnosis, 170)
    pdf.text(diagnosisLines, 20, 155)
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Recommended Medications:', 20, 185)
    pdf.setFont('helvetica', 'normal')
    const medicationLines = pdf.splitTextToSize(currentPrescription.medications, 170)
    pdf.text(medicationLines, 20, 200)
    
    let yPosition = 200 + (medicationLines.length * 5)
    
    if (currentPrescription.advice) {
      pdf.setFont('helvetica', 'bold')
      pdf.text('General Advice:', 20, yPosition + 20)
      pdf.setFont('helvetica', 'normal')
      const adviceLines = pdf.splitTextToSize(currentPrescription.advice, 170)
      pdf.text(adviceLines, 20, yPosition + 35)
      yPosition += 35 + (adviceLines.length * 5)
    }
    
    if (currentPrescription.followUp) {
      pdf.setFont('helvetica', 'bold')
      pdf.text('Follow-Up:', 20, yPosition + 20)
      pdf.setFont('helvetica', 'normal')
      const followUpLines = pdf.splitTextToSize(currentPrescription.followUp, 170)
      pdf.text(followUpLines, 20, yPosition + 35)
      yPosition += 35 + (followUpLines.length * 5)
    }
    
    pdf.setFont('helvetica', 'italic')
    pdf.text(`Doctor: ${currentPrescription.doctor}`, 20, yPosition + 30)
    pdf.text('Note: This is an AI-generated prescription. Please consult with a licensed physician.', 20, yPosition + 45)
    
    pdf.save(`prescription-${currentPrescription.patientName}-${currentPrescription.date}.pdf`)
  }

  const shareViaWhatsApp = () => {
    if (!currentPrescription) return
    
    let message = `*Medical Prescription*\n\n🔹 Patient: ${currentPrescription.patientName}\n🔹 Date: ${currentPrescription.date}\n\n🔹 Symptoms: ${currentPrescription.symptoms}\n\n🔹 Diagnosis: ${currentPrescription.diagnosis}\n\n🔹 Medications: ${currentPrescription.medications}`
    
    if (currentPrescription.advice) {
      message += `\n\n🔹 General Advice: ${currentPrescription.advice}`
    }
    
    if (currentPrescription.followUp) {
      message += `\n\n🔹 Follow-Up: ${currentPrescription.followUp}`
    }
    
    message += `\n\n🔹 Doctor: ${currentPrescription.doctor}\n\n*Note: This is an AI-generated prescription. Please consult with a licensed physician.*`
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  const groupSessionsByDate = (sessions: ChatSession[]) => {
    const groups: { [key: string]: ChatSession[] } = {}
    
    sessions.forEach(session => {
      const dateKey = session.createdAt.toDateString()
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(session)
    })
    
    return groups
  }

  const formatDateGroup = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-blue-900 dark:via-gray-900 dark:to-cyan-900 p-6 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/20 h-[calc(100vh-120px)] flex flex-col overflow-hidden transition-colors duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 dark:from-blue-500/10 dark:to-cyan-500/10 transition-colors duration-300">
            <div className="flex items-center space-x-3">
              <div className="w-14 h-14 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">My Doc</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">AI Health Assistant ✨</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 rounded-2xl hover:from-gray-200 hover:to-gray-300 transition-all duration-300 shadow-sm hover:shadow-md transform hover:scale-105"
              >
                <History className="w-4 h-4" />
                <span>History</span>
              </button>
              
              <button
                onClick={startNewSession}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-2xl hover:from-blue-600 hover:to-cyan-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Plus className="w-4 h-4" />
                <span>New Chat</span>
              </button>
              
              {currentPrescription && (
                <button
                  onClick={() => setShowPrescription(true)}
                  className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl hover:from-emerald-600 hover:to-teal-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <Stethoscope className="w-4 h-4" />
                  <span>View Prescription</span>
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-transparent to-blue-50/30">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-3xl px-6 py-4 shadow-lg backdrop-blur-sm ${
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-blue-500/25'
                      : 'bg-white/90 text-gray-900 border border-gray-100 shadow-gray-500/10'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    {message.role === 'assistant' && (
                      <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mt-0.5">
                        <Bot className="w-3 h-3 text-white" />
                      </div>
                    )}
                    {message.role === 'user' && (
                      <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mt-0.5">
                        <User className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      
                      {message.files && message.files.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {message.files.map((file, index) => (
                            <div key={index} className="flex items-center space-x-2 text-sm opacity-90 bg-white/10 rounded-lg px-2 py-1">
                              <FileText className="w-4 h-4" />
                              <span>{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <p className={`text-xs mt-2 ${
                        message.role === 'user' ? 'text-white/70' : 'text-gray-400'
                      }`}>
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl px-6 py-4 shadow-lg border border-gray-100">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-gray-600 font-medium">MedMind AI is analyzing...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* File Upload Area */}
          {selectedFiles.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100 bg-gradient-to-r from-blue-50/50 to-cyan-50/50">
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-2xl border border-blue-200 shadow-sm">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700">{file.name}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-blue-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-gray-100 p-6 bg-gradient-to-r from-blue-50/30 to-cyan-50/30">
            <div className="flex space-x-4 items-end">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-gray-400 hover:text-blue-600 transition-all duration-300 hover:bg-blue-50 rounded-2xl"
              >
                <Upload className="w-5 h-5" />
              </button>
              
              <div className="flex-1 relative">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Describe your symptoms, upload reports, or ask health questions..."
                  className="w-full px-6 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 resize-none bg-white/80 backdrop-blur-sm shadow-sm"
                  rows={2}
                  disabled={loading}
                />
              </div>
              
              {/* Voice Recorder */}
              <VoiceRecorder
                onTranscriptionComplete={handleVoiceTranscription}
                isProcessing={loading || isSpeaking}
              />
              
              <button
                onClick={sendMessage}
                disabled={(!inputMessage.trim() && selectedFiles.length === 0) || loading}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl font-semibold hover:from-blue-700 hover:to-cyan-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            
            <div className="mt-4 flex items-center space-x-2 text-xs text-gray-400">
              <FileText className="w-4 h-4" />
              <span>Upload medical reports (PDF, images) • Use voice or text • AI remembers your conversation history ✨</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col border border-white/20">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-cyan-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <History className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Chat History</h3>
                    <p className="text-sm text-gray-500 font-medium">Your medical consultation history</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-all duration-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {chatSessions.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <History className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No chat history yet</h3>
                  <p className="text-gray-600">Start a conversation to see your chat history here</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupSessionsByDate(chatSessions)).map(([dateString, sessions]) => (
                    <div key={dateString}>
                      <h4 className="text-lg font-bold text-gray-900 mb-4 sticky top-0 bg-white/80 backdrop-blur-sm py-2 rounded-lg">
                        {formatDateGroup(dateString)}
                      </h4>
                      <div className="space-y-3">
                        {sessions.map((session) => (
                          <div
                            key={session.id}
                            className="group bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-gray-100 hover:shadow-lg transition-all duration-300 cursor-pointer"
                            onClick={() => loadSession(session)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h5 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                  {session.title}
                                </h5>
                                <p className="text-sm text-gray-500 mt-1">
                                  {session.messages.length} messages • {session.updatedAt.toLocaleTimeString()}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteSession(session.id)
                                  }}
                                  className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prescription Modal */}
      {showPrescription && currentPrescription && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Medical Prescription</h3>
                <button
                  onClick={() => setShowPrescription(false)}
                  className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-all duration-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 border border-gray-100 shadow-sm">
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">MEDICAL PRESCRIPTION</h2>
                  <div className="w-20 h-1 bg-gradient-to-r from-blue-600 to-cyan-600 mx-auto mt-3 rounded-full"></div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Patient Name</label>
                    <p className="text-gray-900 font-bold text-lg">{currentPrescription.patientName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Date</label>
                    <p className="text-gray-900 font-bold text-lg">{currentPrescription.date}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Symptoms</label>
                    <p className="text-gray-900 mt-2 leading-relaxed">{currentPrescription.symptoms}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Diagnosis</label>
                    <p className="text-gray-900 mt-2 leading-relaxed">{currentPrescription.diagnosis}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recommended Medications</label>
                    <p className="text-gray-900 mt-2 leading-relaxed">{currentPrescription.medications}</p>
                  </div>
                  
                  {currentPrescription.advice && (
                    <div>
                      <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">General Advice</label>
                      <p className="text-gray-900 mt-2 leading-relaxed">{currentPrescription.advice}</p>
                    </div>
                  )}
                  
                  {currentPrescription.followUp && (
                    <div>
                      <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Follow-Up</label>
                      <p className="text-gray-900 mt-2 leading-relaxed">{currentPrescription.followUp}</p>
                    </div>
                  )}
                </div>
                
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600 font-semibold">Doctor: {currentPrescription.doctor}</p>
                  <p className="text-xs text-gray-400 mt-2 italic">
                    Note: This is an AI-generated prescription. Please consult with a licensed physician.
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-4 pt-4">
                <button
                  onClick={generatePrescriptionPDF}
                  className="flex-1 flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
                >
                  <Download className="w-5 h-5" />
                  <span>Download PDF</span>
                </button>
                
                <button
                  onClick={shareViaWhatsApp}
                  className="flex-1 flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
                >
                  <Share2 className="w-5 h-5" />
                  <span>Share via WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}