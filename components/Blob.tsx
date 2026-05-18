"use client";

import { motion, useDragControls } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface BlobProps {
  isListening: boolean;
  audioLevel: number;
}

export default function Blob({ isListening, audioLevel }: BlobProps) {
  const [isMobile, setIsMobile] = useState(false);
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const scale = isListening ? 1 + Math.min(audioLevel * 0.6, 0.8) : 1;
  const blobSize = isMobile ? "w-20 h-20" : "w-28 h-28";
  const innerSize = isMobile ? "w-10 h-10" : "w-14 h-14";

  return (
    <div ref={constraintsRef} className="fixed inset-0 z-50 pointer-events-none">
      <motion.div
        drag
        dragControls={dragControls}
        dragConstraints={constraintsRef}
        dragMomentum={false}
        dragElastic={0.1}
        whileDrag={{ scale: 1.05, cursor: "grabbing" }}
        className="absolute pointer-events-auto cursor-grab"
        style={{ bottom: isMobile ? "5%" : "8%", right: isMobile ? "5%" : "8%" }}
        onPointerDown={(e) => dragControls.start(e)}
      >
        <motion.div
          animate={{
            scale,
            borderRadius: [
              "40% 60% 70% 30%",
              "50% 50% 30% 70%",
              "60% 40% 50% 50%",
              "40% 60% 70% 30%",
            ],
          }}
          transition={{
            scale: { type: "spring", stiffness: 300, damping: 20 },
            borderRadius: { duration: 4, repeat: Infinity, ease: "linear" },
          }}
          className={`${blobSize} rounded-full flex items-center justify-center ${
            isListening
              ? "bg-gradient-to-tr from-cyan-600 to-blue-400 shadow-[0_0_40px_rgba(0,212,255,0.4)]"
              : "bg-zinc-800 border border-zinc-700 shadow-[0_0_20px_rgba(0,212,255,0.15)]"
          }`}
        >
          <div
            className={`${innerSize} rounded-full blur-md ${
              isListening ? "bg-white/40" : "bg-cyan-500/10"
            }`}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
