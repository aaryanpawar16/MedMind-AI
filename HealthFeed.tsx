import React, { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Loader, Heart, Activity, TrendingUp, Calendar, Download, Share2, Plus, History, Trash2 } from 'lucide-react'
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

interface HealthPlan {
  patientName: string
  date: string
  goals: string
  recommendations: string
  exercises: string
  nutrition: string
  lifestyle: string
  followUp: string
  doctor: string
}

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

const HEALTH_SYSTEM_PROMPT = `System Prompt for MedMind AI Health Coach
You are MedMind AI Health Coach, speaking with {USER_NAME}, a {AGE}-year-old {GENDER}. Always address them by their name and consider their medical profile when providing health advice.

After discussing health goals, lifestyle, or wellness topics, you must generate a complete and personalized health plan.

Use the following structure when rendering a health plan:

Patient Name: {USER_NAME}
Date: [Auto-generated]

Health Goals:
[List specific, measurable goals based on user input]

Recommendations:
Daily exercise routine tailored to age and fitness level
Stress management techniques
Sleep optimization strategies
Preventive health measures

Exercise Plan:
Cardio: 30 minutes moderate activity, 5 days per week
Strength: 2-3 sessions per week focusing on major muscle groups
Flexibility: Daily stretching or yoga for 10-15 minutes

Nutrition Guidelines:
Balanced diet with appropriate caloric intake
Hydration goals (8-10 glasses of water daily)
Specific dietary recommendations based on health profile

Lifestyle Modifications:
Sleep schedule optimization (7-9 hours nightly)
Stress reduction techniques
Social activity recommendations
Screen time management

Follow-Up:
Weekly progress check-ins
Monthly health assessments
Quarterly goal reviews

Health Coach: AI-Powered by MedMind
Note: This is an AI-generated health plan. Please consult healthcare professionals for medical advice.

At the end of the consultation, render this health plan in a clean format, and display buttons:
- Download PDF
- Share via WhatsApp

Do not use markdown or formatting characters. Use plain, professional language like a human health coach. Keep the tone motivational and supportive.

Core Capabilities:
- Provide personalized health and wellness advice
- Create custom exercise and nutrition plans
- Offer mental wellness support and stress management
- Help with lifestyle optimization and habit formation
- Motivate and encourage healthy behaviors

Always encourage professional medical consultation for serious health concerns.`

export default function HealthFeed() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null)
  const [currentHealthPlan, setCurrentHealthPlan] = useState<HealthPlan | null>(null)
  const [showHealthPlan, setShowHealthPlan] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
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
        .eq('type', 'health')
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

      const currentSession = sessions.find(s => s.id === currentSessionId)
      if (currentSession && currentSession.messages.length > 1) {
        const { error } = await supabase
          .from('chat_sessions')
          .upsert({
            id: currentSession.id,
            user_id: user.id,
            title: currentSession.title,
            type: 'health',
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
    const savedSessionId = localStorage.getItem('healthFeed_currentSessionId')
    const savedMessages = localStorage.getItem('healthFeed_currentMessages')
    
    // Validate if savedSessionId is a valid UUID
    const isValidUUID = (str: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      return uuidRegex.test(str)
    }
    
    if (savedSessionId && savedMessages) {
      // Check if savedSessionId is a valid UUID
      if (!isValidUUID(savedSessionId)) {
        // Clear invalid session data and start fresh
        localStorage.removeItem('healthFeed_currentSessionId')
        localStorage.removeItem('healthFeed_currentMessages')
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
        localStorage.removeItem('healthFeed_currentSessionId')
        localStorage.removeItem('healthFeed_currentMessages')
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
      content: 'Hello! I\'m your MedMind AI Health Coach. I\'m here to help you achieve your wellness goals with personalized health plans, exercise routines, nutrition guidance, and lifestyle recommendations. What health goals would you like to work on today?',
      timestamp: new Date()
    }]
    setMessages(initialMessages)
    setIsInitialized(true)
    
    // Save to localStorage for persistence
    localStorage.setItem('healthFeed_currentSessionId', newSessionId)
    localStorage.setItem('healthFeed_currentMessages', JSON.stringify(initialMessages))
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
      localStorage.setItem('healthFeed_currentSessionId', currentSessionId)
      localStorage.setItem('healthFeed_currentMessages', JSON.stringify(messages))
    }
  }, [messages, currentSessionId, isInitialized])

  const generateSessionTitle = (messages: Message[]): string => {
    const userMessage = messages.find(m => m.role === 'user')
    if (userMessage) {
      const content = userMessage.content.slice(0, 50)
      return content.length < userMessage.content.length ? content + '...' : content
    }
    return `Health Chat ${new Date().toLocaleDateString()}`
  }

  const loadSession = (session: ChatSession) => {
    if (currentSessionId && messages.length > 1) {
      saveCurrentSession() // Save current session before switching
    }
    setCurrentSessionId(session.id)
    setMessages(session.messages)
    setShowHistory(false)
    
    // Update localStorage
    localStorage.setItem('healthFeed_currentSessionId', session.id)
    localStorage.setItem('healthFeed_currentMessages', JSON.stringify(session.messages))
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
        localStorage.removeItem('healthFeed_currentSessionId')
        localStorage.removeItem('healthFeed_currentMessages')
        startNewSession()
      }
    } catch (err) {
      console.error('Error deleting session:', err)
    }
  }

  const createConversationContext = (): string => {
    let context = ''
    
    const recentMessages = messages.slice(-10)
    if (recentMessages.length > 1) {
      context += '\n\nRecent conversation context:\n'
      recentMessages.forEach(msg => {
        if (msg.role === 'user') {
          context += `User: ${msg.content}\n`
        } else if (msg.role === 'assistant' && !msg.content.includes('Hello! I\'m your MedMind AI Health Coach')) {
          context += `Coach: ${msg.content.slice(0, 200)}...\n`
        }
      })
    }

    const relevantSessions = chatSessions
      .filter(s => s.id !== currentSessionId)
      .slice(0, 3)
      .reverse()

    if (relevantSessions.length > 0) {
      context += '\n\nPrevious health coaching history (for context):\n'
      relevantSessions.forEach(session => {
        const userMessages = session.messages.filter(m => m.role === 'user')
        const assistantMessages = session.messages.filter(m => m.role === 'assistant' && !m.content.includes('Hello! I\'m your MedMind AI Health Coach'))
        
        if (userMessages.length > 0) {
          context += `\nSession ${session.createdAt.toLocaleDateString()}:\n`
          context += `Health goals: ${userMessages.map(m => m.content.slice(0, 100)).join(', ')}\n`
          if (assistantMessages.length > 0) {
            context += `Previous recommendations: ${assistantMessages[0].content.slice(0, 150)}...\n`
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

Always address the user by their name (${userProfile.full_name}) and provide personalized health coaching based on their profile.`
  }

  const extractHealthPlanData = (aiResponse: string): HealthPlan | null => {
    if (!userProfile) return null

    const goalsMatch = aiResponse.match(/Health Goals:\s*(.*?)(?=\n\n|Recommendations:|$)/s)
    const recommendationsMatch = aiResponse.match(/Recommendations:\s*(.*?)(?=\n\n|Exercise Plan:|$)/s)
    const exerciseMatch = aiResponse.match(/Exercise Plan:\s*(.*?)(?=\n\n|Nutrition Guidelines:|$)/s)
    const nutritionMatch = aiResponse.match(/Nutrition Guidelines:\s*(.*?)(?=\n\n|Lifestyle Modifications:|$)/s)
    const lifestyleMatch = aiResponse.match(/Lifestyle Modifications:\s*(.*?)(?=\n\n|Follow-Up:|$)/s)
    const followUpMatch = aiResponse.match(/Follow-Up:\s*(.*?)(?=\n\n|Health Coach:|$)/s)

    return {
      patientName: userProfile.full_name,
      date: new Date().toLocaleDateString(),
      goals: goalsMatch?.[1]?.trim() || inputMessage,
      recommendations: recommendationsMatch?.[1]?.trim() || 'Personalized recommendations based on your health profile',
      exercises: exerciseMatch?.[1]?.trim() || 'Customized exercise plan for your fitness level',
      nutrition: nutritionMatch?.[1]?.trim() || 'Balanced nutrition plan tailored to your needs',
      lifestyle: lifestyleMatch?.[1]?.trim() || 'Lifestyle modifications for optimal health',
      followUp: followUpMatch?.[1]?.trim() || 'Regular check-ins to track progress',
      doctor: 'AI-Powered by MedMind Health Coach'
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || loading) return

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = inputMessage
    setInputMessage('')
    setLoading(true)

    try {
      const conversationContext = createConversationContext()

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: HEALTH_SYSTEM_PROMPT
              .replace('{USER_NAME}', userProfile?.full_name || 'User')
              .replace('{AGE}', userProfile?.age?.toString() || 'unknown')
              .replace('{GENDER}', userProfile?.gender || 'unknown') + 
              '\n\n' + createUserContext() + conversationContext 
          },
          { role: 'user', content: currentInput }
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
          assistantResponse.includes('Health Goals:') || 
          assistantResponse.toLowerCase().includes('health plan')) {
        const healthPlanData = extractHealthPlanData(assistantResponse)
        if (healthPlanData) {
          setCurrentHealthPlan(healthPlanData)
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
      const multilingualPrompt = HEALTH_SYSTEM_PROMPT
        .replace('{USER_NAME}', userProfile?.full_name || 'User')
        .replace('{AGE}', userProfile?.age?.toString() || 'unknown')
        .replace('{GENDER}', userProfile?.gender || 'unknown') + 
        '\n\n' + createUserContext() + conversationContext +
        `\n\nIMPORTANT: The user is speaking in ${language.toUpperCase()}. Please respond in the same language (${language.toUpperCase()}) that the user used. Maintain natural, conversational tone as if you're a health coach speaking directly to the user.` +
        (isFirstInteraction ? '' : '\n\nDO NOT greet the user again. This is a continuing conversation. Jump directly into addressing their health goals or questions.')

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

      // Extract health plan data if applicable
      if (assistantResponse.includes('Patient Name:') || 
          assistantResponse.includes('Health Goals:') || 
          assistantResponse.toLowerCase().includes('health plan')) {
        const healthPlanData = extractHealthPlanData(assistantResponse)
        if (healthPlanData) {
          setCurrentHealthPlan(healthPlanData)
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

  const generateHealthPlanPDF = () => {
    if (!currentHealthPlan) return

    const pdf = new jsPDF()
    
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    pdf.text('PERSONALIZED HEALTH PLAN', 105, 30, { align: 'center' })
    
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Patient: ${currentHealthPlan.patientName}`, 20, 60)
    pdf.text(`Date: ${currentHealthPlan.date}`, 20, 75)
    
    let yPosition = 95
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Health Goals:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    const goalsLines = pdf.splitTextToSize(currentHealthPlan.goals, 170)
    pdf.text(goalsLines, 20, yPosition + 15)
    yPosition += 15 + (goalsLines.length * 5) + 10
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Recommendations:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    const recommendationsLines = pdf.splitTextToSize(currentHealthPlan.recommendations, 170)
    pdf.text(recommendationsLines, 20, yPosition + 15)
    yPosition += 15 + (recommendationsLines.length * 5) + 10
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Exercise Plan:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    const exerciseLines = pdf.splitTextToSize(currentHealthPlan.exercises, 170)
    pdf.text(exerciseLines, 20, yPosition + 15)
    yPosition += 15 + (exerciseLines.length * 5) + 10
    
    if (yPosition > 250) {
      pdf.addPage()
      yPosition = 30
    }
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Nutrition Guidelines:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    const nutritionLines = pdf.splitTextToSize(currentHealthPlan.nutrition, 170)
    pdf.text(nutritionLines, 20, yPosition + 15)
    yPosition += 15 + (nutritionLines.length * 5) + 10
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Lifestyle Modifications:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    const lifestyleLines = pdf.splitTextToSize(currentHealthPlan.lifestyle, 170)
    pdf.text(lifestyleLines, 20, yPosition + 15)
    yPosition += 15 + (lifestyleLines.length * 5) + 10
    
    pdf.setFont('helvetica', 'bold')
    pdf.text('Follow-Up:', 20, yPosition)
    pdf.setFont('helvetica', 'normal')
    const followUpLines = pdf.splitTextToSize(currentHealthPlan.followUp, 170)
    pdf.text(followUpLines, 20, yPosition + 15)
    yPosition += 15 + (followUpLines.length * 5) + 20
    
    pdf.setFont('helvetica', 'italic')
    pdf.text(`Health Coach: ${currentHealthPlan.doctor}`, 20, yPosition)
    pdf.text('Note: This is an AI-generated health plan. Please consult healthcare professionals.', 20, yPosition + 15)
    
    pdf.save(`health-plan-${currentHealthPlan.patientName}-${currentHealthPlan.date}.pdf`)
  }

  const shareViaWhatsApp = () => {
    if (!currentHealthPlan) return
    
    let message = `*Personalized Health Plan*\n\n🔹 Patient: ${currentHealthPlan.patientName}\n🔹 Date: ${currentHealthPlan.date}\n\n🔹 Health Goals: ${currentHealthPlan.goals}\n\n🔹 Recommendations: ${currentHealthPlan.recommendations}\n\n🔹 Exercise Plan: ${currentHealthPlan.exercises}\n\n🔹 Nutrition: ${currentHealthPlan.nutrition}\n\n🔹 Lifestyle: ${currentHealthPlan.lifestyle}\n\n🔹 Follow-Up: ${currentHealthPlan.followUp}\n\n🔹 Health Coach: ${currentHealthPlan.doctor}\n\n*Note: This is an AI-generated health plan. Please consult healthcare professionals.*`
    
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
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50 dark:from-rose-900 dark:via-gray-900 dark:to-pink-900 p-6 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/20 h-[calc(100vh-120px)] flex flex-col overflow-hidden transition-colors duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-rose-500/5 to-pink-500/5 dark:from-rose-500/10 dark:to-pink-500/10 transition-colors duration-300">
            <div className="flex items-center space-x-3">
              <div className="w-14 h-14 bg-gradient-to-r from-rose-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">Health Feed</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">AI Health Coach & Wellness Planner ✨</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-700 dark:text-gray-200 rounded-2xl hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-500 transition-all duration-300 shadow-sm hover:shadow-md transform hover:scale-105"
              >
                <History className="w-4 h-4" />
                <span>History</span>
              </button>
              
              <button
                onClick={startNewSession}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-2xl hover:from-rose-600 hover:to-pink-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Plus className="w-4 h-4" />
                <span>New Chat</span>
              </button>
              
              {currentHealthPlan && (
                <button
                  onClick={() => setShowHealthPlan(true)}
                  className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl hover:from-emerald-600 hover:to-teal-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <Activity className="w-4 h-4" />
                  <span>View Health Plan</span>
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-transparent to-rose-50/30 dark:to-rose-900/30">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-3xl px-6 py-4 shadow-lg backdrop-blur-sm ${
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-rose-500/25'
                      : 'bg-white/90 dark:bg-gray-800/90 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-gray-700 shadow-gray-500/10'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    {message.role === 'assistant' && (
                      <div className="w-6 h-6 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full flex items-center justify-center mt-0.5">
                        <Heart className="w-3 h-3 text-white" />
                      </div>
                    )}
                    {message.role === 'user' && (
                      <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mt-0.5">
                        <User className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      
                      <p className={`text-xs mt-2 ${
                        message.role === 'user' ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'
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
                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl px-6 py-4 shadow-lg border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full flex items-center justify-center">
                      <Heart className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-rose-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-gray-600 dark:text-gray-300 font-medium">Health Coach is thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 dark:border-gray-700 p-6 bg-gradient-to-r from-rose-50/30 to-pink-50/30 dark:from-rose-900/30 dark:to-pink-900/30">
            <div className="flex space-x-4 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Share your health goals, ask for wellness advice, or request a personalized health plan..."
                  className="w-full px-6 py-4 border border-gray-200 dark:border-gray-600 rounded-2xl focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-300 resize-none bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm text-gray-900 dark:text-gray-100"
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
                disabled={!inputMessage.trim() || loading}
                className="px-8 py-4 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-2xl font-semibold hover:from-rose-700 hover:to-pink-700 focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mt-4 flex items-center space-x-2 text-xs text-gray-400 dark:text-gray-500">
              <Heart className="w-4 h-4" />
              <span>Get personalized health plans, exercise routines, and wellness advice • Use voice or text ✨</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col border border-white/20 dark:border-gray-700/20">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-900/50 dark:to-pink-900/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-rose-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <History className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">Health Chat History</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Your wellness coaching sessions</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-300"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {chatSessions.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-gradient-to-r from-rose-100 to-pink-100 dark:from-rose-900/50 dark:to-pink-900/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <History className="w-8 h-8 text-rose-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No health chats yet</h3>
                  <p className="text-gray-600 dark:text-gray-400">Start a wellness conversation to see your chat history here</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupSessionsByDate(chatSessions)).map(([dateString, sessions]) => (
                    <div key={dateString}>
                      <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm py-2 rounded-lg">
                        {formatDateGroup(dateString)}
                      </h4>
                      <div className="space-y-3">
                        {sessions.map((session) => (
                          <div
                            key={session.id}
                            className="group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-4 border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all duration-300 cursor-pointer"
                            onClick={() => loadSession(session)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h5 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                                  {session.title}
                                </h5>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                  {session.messages.length} messages • {session.updatedAt.toLocaleTimeString()}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteSession(session.id)
                                  }}
                                  className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
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

      {/* Health Plan Modal */}
      {showHealthPlan && currentHealthPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-white/20 dark:border-gray-700/20">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/50 dark:to-teal-900/50">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">Personalized Health Plan</h3>
                <button
                  onClick={() => setShowHealthPlan(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-300"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-700 rounded-2xl p-8 border border-gray-100 dark:border-gray-600 shadow-sm">
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">PERSONALIZED HEALTH PLAN</h2>
                  <div className="w-20 h-1 bg-gradient-to-r from-emerald-600 to-teal-600 mx-auto mt-3 rounded-full"></div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Patient Name</label>
                    <p className="text-gray-900 dark:text-gray-100 font-bold text-lg">{currentHealthPlan.patientName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</label>
                    <p className="text-gray-900 dark:text-gray-100 font-bold text-lg">{currentHealthPlan.date}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Health Goals</label>
                    <p className="text-gray-900 dark:text-gray-100 mt-2 leading-relaxed">{currentHealthPlan.goals}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Recommendations</label>
                    <p className="text-gray-900 dark:text-gray-100 mt-2 leading-relaxed">{currentHealthPlan.recommendations}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Exercise Plan</label>
                    <p className="text-gray-900 dark:text-gray-100 mt-2 leading-relaxed">{currentHealthPlan.exercises}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nutrition Guidelines</label>
                    <p className="text-gray-900 dark:text-gray-100 mt-2 leading-relaxed">{currentHealthPlan.nutrition}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Lifestyle Modifications</label>
                    <p className="text-gray-900 dark:text-gray-100 mt-2 leading-relaxed">{currentHealthPlan.lifestyle}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Follow-Up</label>
                    <p className="text-gray-900 dark:text-gray-100 mt-2 leading-relaxed">{currentHealthPlan.followUp}</p>
                  </div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-semibold">Health Coach: {currentHealthPlan.doctor}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">
                    Note: This is an AI-generated health plan. Please consult healthcare professionals.
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-4 pt-4">
                <button
                  onClick={generateHealthPlanPDF}
                  className="flex-1 flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
                >
                  <Download className="w-5 h-5" />
                  <span>Download PDF</span>
                </button>
                
                <button
                  onClick={shareViaWhatsApp}
                  className="flex-1 flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-2xl hover:from-rose-700 hover:to-pink-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
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