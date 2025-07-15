import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import '@mantine/core/styles.css'
import { ColorSchemeScript, MantineProvider } from '@mantine/core'
import { AuthProvider } from '@/lib/auth'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'obliq-2: Visual Modeling & Simulation',
  description: 'Web-based visual modeling and simulation tool',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <MantineProvider
          theme={{
            fontFamily: inter.style.fontFamily,
            // You can customize other theme properties here
            primaryColor: 'blue',
            // Customize component defaults if needed
            components: {
              Button: {
                defaultProps: {
                  size: 'sm',
                },
              },
            },
          }}
        >
          <AuthProvider>
            {children}
          </AuthProvider>
        </MantineProvider>
      </body>
    </html>
  )
}