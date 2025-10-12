import React, { useState, useEffect } from 'react'
import { Upload, Search, Filter, Tag, Calendar, FileText, Image, Download, Trash2, Eye, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface MedicalFile {
  id: string
  name: string
  type: string
  size: number
  uploadDate: Date
  category: string
  tags: string[]
  url?: string
  isPrescription?: boolean
  content?: any
}

const categories = [
  'Lab Results',
  'Prescriptions',
  'X-Rays',
  'MRI/CT Scans',
  'Vaccination Records',
  'Insurance Documents',
  'Doctor Notes',
  'Other'
]

export default function MedicalVault() {
  const [files, setFiles] = useState<MedicalFile[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadCategory, setUploadCategory] = useState('Lab Results')
  const [uploadTags, setUploadTags] = useState('')
  const [loading, setLoading] = useState(false)
  const [viewingFile, setViewingFile] = useState<MedicalFile | null>(null)

  useEffect(() => {
    loadFiles()
  }, [])

  const loadFiles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('medical_files')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading files:', error)
        return
      }

      const formattedFiles = data.map((file: any) => ({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        uploadDate: new Date(file.created_at),
        category: file.category,
        tags: file.tags || [],
        url: file.file_path
      }))

      setFiles(formattedFiles)
    } catch (err) {
      console.error('Error loading files:', err)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    setUploadFiles(selectedFiles)
  }

  const uploadToVault = async () => {
    if (uploadFiles.length === 0) return

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      for (const file of uploadFiles) {
        // Upload file to Supabase storage
        const fileName = `${user.id}/${Date.now()}_${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('medical-files')
          .upload(fileName, file)

        if (uploadError) {
          console.error('Error uploading file:', uploadError)
          continue
        }

        // Save file metadata to database
        const { error: dbError } = await supabase
          .from('medical_files')
          .insert({
            user_id: user.id,
            name: file.name,
            type: file.type,
            size: file.size,
            category: uploadCategory,
            tags: uploadTags.split(',').map(tag => tag.trim()).filter(tag => tag),
            file_path: fileName
          })

        if (dbError) {
          console.error('Error saving file metadata:', dbError)
        }
      }

      await loadFiles() // Reload files from database
      setShowUploadModal(false)
      setUploadFiles([])
      setUploadTags('')
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         file.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesCategory = selectedCategory === 'All' || file.category === selectedCategory
    const matchesTags = selectedTags.length === 0 || 
                       selectedTags.some(tag => file.tags.includes(tag))
    
    return matchesSearch && matchesCategory && matchesTags
  })

  const allTags = Array.from(new Set(files.flatMap(file => file.tags)))

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (type: string) => {
    if (type.includes('image')) return <Image className="w-5 h-5 text-blue-600" />
    return <FileText className="w-5 h-5 text-red-600" />
  }

  const viewFile = (file: MedicalFile) => {
    // Get the signed URL from Supabase storage and open it
    if (file.url) {
      getSignedUrl(file.url)
    }
  }

  const getSignedUrl = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('medical-files')
        .createSignedUrl(filePath, 3600) // 1 hour expiry
      
      if (error) {
        console.error('Error getting signed URL:', error)
        // Fallback: try to create the bucket if it doesn't exist
        await createBucketIfNotExists()
        return
      }
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      }
    } catch (err) {
      console.error('Error viewing file:', err)
      alert('Unable to view file. Please try again.')
    }
  }

  const createBucketIfNotExists = async () => {
    try {
      // Try to create the bucket
      const { error } = await supabase.storage.createBucket('medical-files', {
        public: false,
        allowedMimeTypes: ['image/*', 'application/pdf'],
        fileSizeLimit: 10485760 // 10MB
      })
      
      if (error && !error.message.includes('already exists')) {
        console.error('Error creating bucket:', error)
      } else {
        console.log('Medical files bucket created or already exists')
      }
    } catch (err) {
      console.error('Error with bucket creation:', err)
    }
  }

  const deleteFile = async (fileId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('medical_files')
        .delete()
        .eq('id', fileId)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error deleting file:', error)
        return
      }

      await loadFiles() // Reload files
    } catch (err) {
      console.error('Error deleting file:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-900 dark:via-gray-900 dark:to-teal-900 p-6 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent mb-2">Medical Vault</h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg">Secure storage for all your medical documents ✨</p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
          >
            <Plus className="w-5 h-5" />
            <span>Upload Files</span>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-lg border border-white/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search files and tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300 bg-white/80 backdrop-blur-sm"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300 bg-white/80 backdrop-blur-sm"
            >
              <option value="All">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <div className="flex flex-wrap gap-2">
              {allTags.slice(0, 5).map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    if (selectedTags.includes(tag)) {
                      setSelectedTags(prev => prev.filter(t => t !== tag))
                    } else {
                      setSelectedTags(prev => [...prev, tag])
                    }
                  }}
                  className={`px-4 py-2 rounded-2xl text-sm transition-all duration-300 transform hover:scale-105 ${
                    selectedTags.includes(tag)
                      ? 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700 border border-emerald-300 shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Tag className="w-3 h-3 inline mr-1" />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Files Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFiles.map(file => (
          <div key={file.id} className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center">
                  {getFileIcon(file.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate text-lg">{file.name}</h3>
                  <p className="text-sm text-gray-500 font-medium">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <div className="flex space-x-1">
                <button 
                  onClick={() => viewFile(file)}
                  className="p-2 text-gray-400 hover:text-emerald-600 transition-all duration-300 hover:bg-emerald-50 rounded-xl"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => {
                    // Download file functionality
                    console.log('Download file:', file.name)
                  }}
                  className="p-2 text-gray-400 hover:text-green-600 transition-all duration-300 hover:bg-green-50 rounded-xl"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => {
                    deleteFile(file.id)
                  }}
                  className="p-2 text-gray-400 hover:text-red-600 transition-all duration-300 hover:bg-red-50 rounded-xl"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mb-4">
              <span className="inline-block px-4 py-2 bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700 text-sm rounded-2xl font-semibold shadow-sm">
                {file.category}
              </span>
            </div>

            <div className="flex flex-wrap gap-1 mb-4">
              {file.tags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-xl font-medium">
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex items-center text-xs text-gray-400 font-medium">
              <Calendar className="w-3 h-3 mr-1" />
              {file.uploadDate.toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {filteredFiles.length === 0 && (
        <div className="text-center py-20">
          <div className="w-24 h-24 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <FileText className="w-12 h-12 text-emerald-500" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">No files found</h3>
          <p className="text-gray-600 text-lg">Upload your first medical document to get started ✨</p>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full border border-white/20">
            <div className="p-8 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
              <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Upload Medical Files</h3>
            </div>
            
            <div className="p-8 space-y-8">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-4">
                  Select Files
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-emerald-400 transition-all duration-300">
                  <div className="w-16 h-16 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-8 h-8 text-emerald-600" />
                  </div>
                  <p className="text-sm text-gray-600 mb-4 font-medium">Choose files to upload</p>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 rounded-2xl cursor-pointer hover:from-emerald-100 hover:to-teal-100 transition-all duration-300 font-semibold shadow-sm hover:shadow-md transform hover:scale-105"
                  >
                    Choose Files
                  </label>
                </div>
                
                {uploadFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {uploadFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200">
                        <span className="text-sm text-gray-700 font-medium">{file.name}</span>
                        <span className="text-xs text-gray-500 font-medium">{formatFileSize(file.size)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Category
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300 bg-white/80 backdrop-blur-sm"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="e.g., blood test, cholesterol, annual checkup"
                  className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300 bg-white/80 backdrop-blur-sm"
                />
              </div>
            </div>
            
            <div className="p-8 border-t border-gray-100 flex space-x-4 bg-gradient-to-r from-gray-50 to-white">
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex-1 px-6 py-4 text-gray-700 border border-gray-300 rounded-2xl hover:bg-gray-50 transition-all duration-300 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={uploadToVault}
                disabled={uploadFiles.length === 0 || loading}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-300 disabled:opacity-50 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                {loading ? 'Uploading...' : 'Upload Files'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      </div>
    </div>
  )
}