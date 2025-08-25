"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import React from "react"

interface CustomSliderProps {
    initialValue?: number
    onChange?: (value: number) => void
}

const CustomSlider = ({ initialValue = 0, onChange }: CustomSliderProps) => {
    const [activeStep, setActiveStep] = useState(initialValue)
    const [isDragging, setIsDragging] = useState(false)
    const sliderRef = useRef<HTMLDivElement>(null)

    // Time values: 2m, 10m, 30m, 1h, 6h, 12h, 24h
    const timeValues = ["2m", "10m", "30m", "1h", "6h", "12h", "24h"]
    const totalSteps = timeValues.length

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
        const newStep = Math.round(pct * (totalSteps - 1))

        if (newStep !== activeStep && newStep >= 0 && newStep < totalSteps) {
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
                <span className="text-white text-sm sm:text-base md:-ml-2 -ml-1 tracking-tighter">Duration</span>
                <span className="text-white text-sm sm:text-base md:-mr-2 -mr-1">{timeValues[activeStep]}</span>
            </div>

            {/* Slider track */}
            <div
                ref={sliderRef}
                className="relative w-full cursor-pointer select-none"
                onMouseDown={handleMouseDown}
            >
                {/* Lines */}
                <div className="absolute top-1/2 left-0 w-full flex items-center transform -translate-y-1/2">
                    {Array.from({ length: totalSteps - 1 }, (_, i) => {
                        const lineWidth = `calc(100% / ${totalSteps - 1} - 8px)` // fluid width
                        const leftOffset = `calc(${i} * (100% / ${totalSteps - 1}) + 4px)`

                        return (
                            <div
                                key={i}
                                className="absolute transition-colors duration-300"
                                style={{
                                    width: lineWidth,
                                    left: leftOffset,
                                    height: "1px",
                                    backgroundColor: i < activeStep ? "white" : "#676767",
                                }}
                            />
                        )
                    })}
                </div>

                {/* Steps */}
                <div className="relative flex items-center">
                    {timeValues.map((_, i) => {
                        const leftPosition = i === 0 ? "0%" : i === totalSteps - 1 ? "100%" : `calc(${i * 100}% / ${totalSteps - 1})`

                        return (
                            <button
                                key={i}
                                onClick={() => handleStepClick(i)}
                                className="absolute transition-all duration-200 hover:scale-110 z-10"
                                style={{
                                    left: leftPosition,
                                    width: activeStep === i ? "11px" : "5px",
                                    height: activeStep === i ? "11px" : "5px",
                                    backgroundColor: i <= activeStep ? "white" : "#676767",
                                    borderRadius: "50%",
                                    border: "none",
                                    cursor: "pointer",
                                    transform: i === 0 ? "translateX(0%)" : i === totalSteps - 1 ? "translateX(-100%)" : "translateX(-50%)",
                                }}
                            > </button>
                        )
                    })}
                </div>
            </div>

            {/* Bottom time labels */}
            <div className="relative w-full text-xs sm:text-sm">
                {timeValues.map((timeValue, i) => {
                    const leftPosition = i === 0 ? "0%" : i === totalSteps - 1 ? "100%" : `calc(${i * 100}% / ${totalSteps - 1})`
                    
                    return (
                        <button
                            key={i}
                            onClick={() => handleStepClick(i)}
                            className="absolute transition-colors duration-200 hover:text-white cursor-pointer z-10"
                            style={{
                                left: leftPosition,
                                transform: i === 0 ? "translateX(0%)" : i === totalSteps - 1 ? "translateX(-100%)" : "translateX(-50%)",
                                color: activeStep === i ? "white" : "#676767",
                            }}
                        >
                            {timeValue}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export default CustomSlider