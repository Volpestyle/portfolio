"use client";
import React, { useEffect, useState } from "react";
import { useSpring, animated } from "@react-spring/web";
import { usePathname } from "next/navigation";

const AnimatedBackground: React.FC = () => {
  const [key, setKey] = useState(0);

  // Need to force re-render, fixes animation not starting on refresh
  useEffect(() => {
    setKey((prevKey) => prevKey + 1);
  }, []);

  const props = useSpring({
    from: { transform: "translateY(0%)" },
    to: { transform: "translateY(-50%)" },
    config: { duration: 60000 },
    reset: true,
    loop: true,
  });

  return (
    <animated.div
      style={{
        ...props,
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "200%",
        backgroundImage: "url('/images/me-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        zIndex: -1,
      }}
    />
  );
};

export default AnimatedBackground;
