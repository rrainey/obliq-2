'use client'

import { useUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'

export default function Home() {
  const { user, loading } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (user && !loading) {
      router.push('/models')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-6">
          obliq-2
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Visual Modeling & Simulation Platform
        </p>
        <p className="text-lg text-gray-500 mb-8">
          Build, test, and simulate block diagram models in your browser, 
          then generate C code for embedded deployment.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          Get Started
        </Link>
      </div>
    </div>
  )
}