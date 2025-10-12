import React, { useState, useEffect } from 'react'
import { User, Phone, Mail, Calendar, FileText, X, Edit } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface UserProfileData {
  full_name: string
  age: number
  gender: string
  contact_number: string
  email: string
  past_medical_history?: string
  tobacco_use: boolean
  current_medications?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  created_at: string
}

interface UserProfileProps {
  isOpen: boolean
  onClose: () => void
}

export default function UserProfile({ isOpen, onClose }: UserProfileProps) {
  const [profile, setProfile] = useState<UserProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      fetchProfile()
    }
  }, [isOpen])

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error) {
        console.error('Error fetching profile:', error)
        return
      }

      setProfile(data)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-blue-50">
          <div className="flex items-center space-x-3">
            <div className="w-16 h-16 bg-gradient-to-r from-violet-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">My Profile</h2>
              <p className="text-sm text-gray-500 font-medium">Personal & Medical Information ✨</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all duration-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex space-x-1">
                <div className="w-3 h-3 bg-violet-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-3 h-3 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          ) : profile ? (
            <div className="space-y-8">
              {/* Basic Information */}
              <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-2xl p-6 border border-violet-100">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                  <div className="w-8 h-8 bg-gradient-to-r from-violet-500 to-blue-500 rounded-xl flex items-center justify-center mr-3">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Full Name</label>
                    <p className="text-gray-900 font-bold text-lg mt-1">{profile.full_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Age</label>
                    <p className="text-gray-900 font-bold text-lg mt-1">{profile.age} years</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Gender</label>
                    <p className="text-gray-900 font-bold text-lg mt-1">{profile.gender}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Member Since</label>
                    <p className="text-gray-900 font-bold text-lg mt-1">
                      {new Date(profile.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                  <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center mr-3">
                    <Phone className="w-4 h-4 text-white" />
                  </div>
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Phone Number</label>
                    <p className="text-gray-900 font-bold text-lg mt-1">{profile.contact_number}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Email Address</label>
                    <p className="text-gray-900 font-bold text-lg mt-1">{profile.email}</p>
                  </div>
                </div>
              </div>

              {/* Medical Information */}
              <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl p-6 border border-rose-100">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                  <div className="w-8 h-8 bg-gradient-to-r from-rose-500 to-pink-500 rounded-xl flex items-center justify-center mr-3">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  Medical Information
                </h3>
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Past Medical History</label>
                    <p className="text-gray-900 mt-2 leading-relaxed">
                      {profile.past_medical_history || 'No medical history provided'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Tobacco Use</label>
                    <p className="text-gray-900 font-bold text-lg mt-1">
                      {profile.tobacco_use ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Current Medications</label>
                    <p className="text-gray-900 mt-2 leading-relaxed">
                      {profile.current_medications || 'No current medications'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              {(profile.emergency_contact_name || profile.emergency_contact_phone) && (
                <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 border border-orange-100">
                  <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl flex items-center justify-center mr-3">
                      <Phone className="w-4 h-4 text-white" />
                    </div>
                    Emergency Contact
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {profile.emergency_contact_name && (
                      <div>
                        <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Contact Name</label>
                        <p className="text-gray-900 font-bold text-lg mt-1">{profile.emergency_contact_name}</p>
                      </div>
                    )}
                    {profile.emergency_contact_phone && (
                      <div>
                        <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Contact Phone</label>
                        <p className="text-gray-900 font-bold text-lg mt-1">{profile.emergency_contact_phone}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gradient-to-r from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 text-lg">Unable to load profile information</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-8 bg-gradient-to-r from-gray-50 to-white">
          <button className="w-full bg-gradient-to-r from-violet-600 to-blue-600 text-white py-4 px-6 rounded-2xl font-semibold hover:from-violet-700 hover:to-blue-700 transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-105">
            <Edit className="w-5 h-5" />
            <span>Edit Profile</span>
          </button>
        </div>
      </div>
    </div>
  )
}