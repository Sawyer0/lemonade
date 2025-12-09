import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider, ToastProvider } from "@/presentation/context";
import { OfflineBanner } from "@/presentation/components/ui/OfflineBanner";
import { KonstaProvider } from "@/presentation/providers/KonstaProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Master Tech",
  description: "Your AI-powered automotive diagnostic assistant",
};

export const viewport: Viewport = {
  themeColor: "#3B82F6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white pt-safe pb-safe`}
      >
        <AuthProvider>
          <ToastProvider>
            <KonstaProvider>
              <OfflineBanner />
              {children}
            </KonstaProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

