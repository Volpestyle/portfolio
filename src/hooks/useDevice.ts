import { useState, useEffect } from 'react';

interface DeviceInfo {
    isTouch: boolean;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    deviceType: 'mobile' | 'tablet' | 'desktop';
}

export function useDevice(): DeviceInfo {
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
        isTouch: false,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        deviceType: 'desktop',
    });

    useEffect(() => {
        const updateDeviceInfo = () => {
            // Check for touch capability
            const isTouch = (
                'ontouchstart' in window ||
                navigator.maxTouchPoints > 0 ||
                // @ts-ignore
                navigator.msMaxTouchPoints > 0
            );

            // Screen width breakpoints (you can adjust these)
            const mobileBreakpoint = 768;
            const tabletBreakpoint = 1024;

            const width = window.innerWidth;

            // Determine device type based on screen width and touch capability
            const isMobile = width < mobileBreakpoint;
            const isTablet = width >= mobileBreakpoint && width < tabletBreakpoint;
            const isDesktop = width >= tabletBreakpoint;

            // Get more specific device info from user agent
            const userAgent = navigator.userAgent.toLowerCase();
            const isIOS = /iphone|ipad|ipod/.test(userAgent);
            const isAndroid = /android/.test(userAgent);

            // Determine final device type
            let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';

            if (isMobile || isIOS || (isAndroid && !isTablet)) {
                deviceType = 'mobile';
            } else if (isTablet || (isIOS && isTablet)) {
                deviceType = 'tablet';
            }

            setDeviceInfo({
                isTouch,
                isMobile,
                isTablet,
                isDesktop,
                deviceType,
            });
        };

        // Initial check
        updateDeviceInfo();

        // Update on resize
        window.addEventListener('resize', updateDeviceInfo);

        return () => {
            window.removeEventListener('resize', updateDeviceInfo);
        };
    }, []);

    return deviceInfo;
} 