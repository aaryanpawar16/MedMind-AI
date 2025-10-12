import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { supabase } from './lib/supabase'
import { Session } from '@supabase/supabase-js'
import { ThemeProvider } from './contexts/ThemeContext'
import LoginPage from './components/LoginPage'
import SignUpPage from './components/SignUpPage'
import ProfileCreation from './components/ProfileCreation'
import Navigation from './components/Navigation'
import UserProfile from './components/UserProfile'
import MyDoc from './components/MyDoc'
import MedicalVault from './components/MedicalVault'
import HealthFeed from './components/HealthFeed'
import MealAnalyzer from './components/MealAnalyzer'
import SmartKitchen from './components/SmartKitchen'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(true)
  const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null)
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setProfileCompleted(null) // Reset profile status when auth changes
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const checkProfileStatus = async () => {
      if (session?.user) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('profile_completed')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking profile status:', error)
          setProfileCompleted(false)
        } else {
          setProfileCompleted(data?.profile_completed || false)
        }
      }
    }

    if (session) {
      checkProfileStatus()
    }
  }, [session])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-r from-violet-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Heart className="w-8 h-8 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full flex items-center justify-center animate-pulse">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
          </div>
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
          <p className="text-gray-600 font-medium">Loading MedMind AI...</p>
        </div>
      </div>
    )
  }

  if (session) {
    if (profileCompleted === null) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-blue-50 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex space-x-1">
              <div className="w-3 h-3 bg-violet-500 rounded-full animate-bounce"></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-3 h-3 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <p className="text-gray-600 font-medium">Checking profile status...</p>
          </div>
        </div>
      )
    }

    if (!profileCompleted) {
      return (
        <ThemeProvider>
          <ProfileCreation 
            userEmail={session.user.email || ''} 
            onProfileComplete={() => setProfileCompleted(true)}
          />
        </ThemeProvider>
      )
    }

    return (
      <ThemeProvider>
        <Router>
          <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900 transition-colors duration-300">
            <Navigation onShowProfile={() => setShowProfile(true)} />
            <Routes>
              <Route path="/" element={<Navigate to="/my-doc" replace />} />
              <Route path="/my-doc" element={<MyDoc />} />
              <Route path="/medical-vault" element={<MedicalVault />} />
              <Route path="/health-feed" element={<HealthFeed />} />
              <Route path="/meal-analyzer" element={<MealAnalyzer />} />
              <Route path="/smart-kitchen" element={<SmartKitchen />} />
            </Routes>
            <UserProfile isOpen={showProfile} onClose={() => setShowProfile(false)} />
          </div>
        </Router>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      {isLogin ? (
        <LoginPage onToggleAuth={() => setIsLogin(false)} />
      ) : (
        <SignUpPage onToggleAuth={() => setIsLogin(true)} />
      )}
    </ThemeProvider>
  )
}

export default App