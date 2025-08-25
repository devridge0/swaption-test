"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import React from "react"

interface CustomSliderProps {
    initialValue?: number
    onChange?: (value: number) => void
}

const CustomSlider = ({ initialValue = 1, onChange }: CustomSliderProps) => {
    const [activeStep, setActiveStep] = useState(initialValue)
    const [isDragging, setIsDragging] = useState(false)
    const sliderRef = useRef<HTMLDivElement>(null)

    const handleStepClick = (step: number) => {
        setActiveStep(step)
        onChange?.(step)
    }

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        setIsDragging(true)
        updateStepFromPosition(e.clientX)
    }, [])

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDragging) return
            updateStepFromPosition(e.clientX)
        },
        [isDragging],
    )

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
    }, [])

    const updateStepFromPosition = (clientX: number) => {
        if (!sliderRef.current) return

        const rect = sliderRef.current.getBoundingClientRect()
        const relativeX = clientX - rect.left
        const pct = Math.max(0, Math.min(1, relativeX / rect.width))
        const newStep = Math.round(pct * 9) + 1

        if (newStep !== activeStep) {
            setActiveStep(newStep)
            onChange?.(newStep)
        }
    }

    useEffect(() => {
        if (isDragging) {
            document.addEventListener("mousemove", handleMouseMove)
            document.addEventListener("mouseup", handleMouseUp)
            return () => {
                document.removeEventListener("mousemove", handleMouseMove)
                document.removeEventListener("mouseup", handleMouseUp)
            }
        }
    }, [isDragging, handleMouseMove, handleMouseUp])

    return (
        <div className="flex flex-col justify-center items-center space-y-6 w-full min-w-[290px] max-w-[300px]">
            {/* Top labels */}
            <div className="flex justify-between items-center w-full">
                <span className="text-white text-sm sm:text-base md:-ml-2 -ml-1 tracking-tighter">Percentage</span>
                <span className="text-white text-sm sm:text-base md:-mr-2 -mr-1">{activeStep}%</span>
            </div>

            {/* Slider track */}
            <div
                ref={sliderRef}
                className="relative w-full cursor-pointer select-none"
                onMouseDown={handleMouseDown}
            >
                {/* Lines */}
                <div className="absolute top-1/2 left-0 w-full flex items-center transform -translate-y-1/2">
                    {Array.from({ length: 9 }, (_, i) => {
                        const lineWidth = `calc(100% / 9 - 8px)` // fluid width
                        const leftOffset = `calc(${i} * (100% / 9) + 4px)`

                        return (
                            <div
                                key={i}
                                className="absolute transition-colors duration-300"
                                style={{
                                    width: lineWidth,
                                    left: leftOffset,
                                    height: "1px",
                                    backgroundColor: i < activeStep - 1 ? "white" : "#676767",
                                }}
                            />
                        )
                    })}
                </div>

                {/* Steps */}
                <div className="relative flex items-center">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((step) => {
                        const leftPosition = `calc(${(step - 1) * 100}% / 9)`

                        return (
                            <button
                                key={step}
                                onClick={() => handleStepClick(step)}
                                className="absolute transition-all duration-200 hover:scale-110 z-10"
                                style={{
                                    left: leftPosition,
                                    width: activeStep === step ? "11px" : "5px",
                                    height: activeStep === step ? "11px" : "5px",
                                    backgroundColor: step <= activeStep ? "white" : "#676767",
                                    borderRadius: "50%",
                                    border: "none",
                                    cursor: "pointer",
                                    transform: "translateX(-50%)",
                                }}
                            > </button>
                        )
                    })}
                </div>
            </div>

            {/* Bottom numbers */}
            <div className="relative w-full text-xs sm:text-sm">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((step) => {
                    const leftPosition = `calc(${(step - 1) * 100}% / 9)`
                    
                    return (
                        <button
                            key={step}
                            onClick={() => handleStepClick(step)}
                            className="absolute transition-colors duration-200 hover:text-white cursor-pointer z-10"
                            style={{
                                left: leftPosition,
                                transform: "translateX(-50%)",
                                color: activeStep === step ? "white" : "#676767",
                            }}
                        >
                            {step}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export default CustomSlider