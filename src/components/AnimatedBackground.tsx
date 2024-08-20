import React from "react";
import { useSpring, animated } from "@react-spring/web";

const AnimatedBackground: React.FC = () => {
  const [fade, setFade] = useSpring(() => ({ opacity: 1 }));

  const handleAnimationIteration = () => {
    setFade({ opacity: 0, onRest: () => setFade({ opacity: 1 }) });
  };

  return (
    <animated.div
      style={{
        ...fade,
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "300%", // Increased height
        backgroundImage: "url('/images/handstand.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center top",
        zIndex: -1,
        animation: "slideUp 60s linear infinite",
      }}
      onAnimationIteration={handleAnimationIteration}
    />
  );
};

export default AnimatedBackground;
