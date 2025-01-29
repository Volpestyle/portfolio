'use client';
import { createContext, useContext, ReactNode } from 'react';
import { useDevice } from '@/hooks/useDevice';

interface DeviceContextType {
  isTouch: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: 'mobile' | 'tablet' | 'desktop';
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const deviceInfo = useDevice();

  return <DeviceContext.Provider value={deviceInfo}>{children}</DeviceContext.Provider>;
}

export function useDeviceContext() {
  const context = useContext(DeviceContext);
  if (context === undefined) {
    throw new Error('useDeviceContext must be used within a DeviceProvider');
  }
  return context;
}
