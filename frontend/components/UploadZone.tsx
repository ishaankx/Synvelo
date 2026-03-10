'use client'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { ingestApi } from '@/lib/api'

interface UploadZoneProps {
  dealId: string
  onUploadComplete: () => void
}

interface UploadStatus {
  filename: string
  status: 'uploading' | 'done' | 'error'
  message?: string
}

export default function UploadZone({ dealId, onUploadComplete }: UploadZoneProps) {
  const [uploads, setUploads] = useState<UploadStatus[]>([])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      // Add to status list
      setUploads(u => [...u, { filename: file.name, status: 'uploading' }])
      try {
        const res = await ingestApi.upload(dealId, file)
        setUploads(u => u.map(x =>
          x.filename === file.name
            ? { ...x, status: 'done', message: `${res.data.chunks_created} chunks` }
            : x
        ))
        onUploadComplete()
      } catch (err: any) {
        setUploads(u => u.map(x =>
          x.filename === file.name
            ? { ...x, status: 'error', message: 'Upload failed' }
            : x
        ))
      }
    }
  }, [dealId, onUploadComplete])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'audio/mp4': ['.m4a'],
    }
  })

  return (
    <div>
      <div {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
                   transition-all duration-200
                   ${isDragActive
                     ? 'border-purple-500 bg-purple-500/10'
                     : 'border-[#30363d] hover:border-gray-500 hover:bg-white/2'}`}>
        <input {...getInputProps()} />
        <Upload className={`w-6 h-6 mx-auto mb-2
                           ${isDragActive ? 'text-purple-400' : 'text-gray-600'}`} />
        <p className="text-sm text-gray-500">
          {isDragActive ? 'Drop files here...' : 'Drop PDF, audio, or text files'}
        </p>
        <p className="text-xs text-gray-700 mt-1">or click to browse</p>
      </div>

      {/* Upload status list */}
      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {u.status === 'uploading' && <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />}
              {u.status === 'done' && <CheckCircle className="w-3 h-3 text-green-400" />}
              {u.status === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
              <span className="text-gray-400 truncate flex-1">{u.filename}</span>
              {u.message && (
                <span className={u.status === 'done' ? 'text-green-600' : 'text-red-600'}>
                  {u.message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}