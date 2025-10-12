import React from 'react'
import { NavLink } from 'react-router-dom'
import { Bot, FolderOpen, Heart, LogOut, Bell, Settings, User, Sparkles, Moon, Sun, Camera, ChefHat } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'

interface NavigationProps {
  onShowProfile: () => void
}

export default function Navigation({ onShowProfile }: NavigationProps) {
  const { isDark, toggleTheme } = useTheme()

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const navItems = [
    { path: '/my-doc', icon: Bot, label: 'My Doc', color: 'from-blue-500 to-cyan-500', bgColor: 'bg-gradient-to-r from-blue-50 to-cyan-50' },
    { path: '/medical-vault', icon: FolderOpen, label: 'Medical Vault', color: 'from-emerald-500 to-teal-500', bgColor: 'bg-gradient-to-r from-emerald-50 to-teal-50' },
    { path: '/health-feed', icon: Heart, label: 'Health Feed', color: 'from-rose-500 to-pink-500', bgColor: 'bg-gradient-to-r from-rose-50 to-pink-50' },
    { path: '/meal-analyzer', icon: Camera, label: 'Meal Analyzer', color: 'from-orange-500 to-amber-500', bgColor: 'bg-gradient-to-r from-orange-50 to-amber-50' },
    { path: '/smart-kitchen', icon: ChefHat, label: 'Smart Kitchen', color: 'from-yellow-500 to-orange-500', bgColor: 'bg-gradient-to-r from-yellow-50 to-orange-50' }
  ]

  return (
    <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl shadow-lg border-b border-white/20 dark:border-gray-700/20 sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Heart className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-2 h-2 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 dark:from-violet-400 dark:to-blue-400 bg-clip-text text-transparent">
                  MedMind AI
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Your Intelligent Health Companion</p>
              </div>
            </div>
            
            <nav className="hidden md:flex space-x-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `group relative flex items-center space-x-3 px-6 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                      isActive
                        ? `bg-gradient-to-r ${item.color} text-white shadow-lg shadow-blue-500/25`
                        : `text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white ${item.bgColor} dark:bg-gradient-to-r dark:from-gray-800/50 dark:to-gray-700/50 hover:shadow-md`
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className="w-5 h-5" />
                      <span>{item.label}</span>
                      {isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-2xl" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          
          <div className="flex items-center space-x-3">
            <button 
              onClick={toggleTheme}
              className="group relative p-3 text-gray-400 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-all duration-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-blue-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
            <button 
              onClick={onShowProfile}
              className="group relative p-3 text-gray-400 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-all duration-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl"
            >
              <User className="w-5 h-5" />
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 to-blue-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
            <button className="group relative p-3 text-gray-400 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-all duration-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl">
              <Bell className="w-5 h-5" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full animate-pulse" />
            </button>
            <button className="group relative p-3 text-gray-400 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-all duration-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl">
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-rose-600 dark:hover:text-rose-400 transition-all duration-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-gray-100 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl transition-colors duration-300">
        <nav className="flex overflow-x-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-4 text-xs font-semibold transition-all duration-300 ${
                  isActive
                    ? `bg-gradient-to-b ${item.color} text-white`
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
                }`
              }
            >
              <item.icon className="w-6 h-6 mb-1" />
              <span>{item.label}</span>
            </NavLink>
          ))}
          
        </nav>
      </div>
    </header>
  )
}