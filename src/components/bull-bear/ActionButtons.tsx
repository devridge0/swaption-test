import React from "react"
import { Button } from "@/components/ui/button"

interface ActionButtonsProps {
    onBearClick?: () => void
    onBullClick?: () => void
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ 
    onBearClick, 
    onBullClick 
}) => {
    return (
        <div className="grid grid-cols-2 gap-3 mt-3">
            <Button
                variant="outline"
                onClick={onBearClick}
                className="flex items-center justify-center gap-2 w-full h-10 sm:h-11 bg-transparent rounded-full text-sm sm:text-base border-[#FF4747] text-[#FF4747] hover:bg-red-500/10"
                aria-label="Bearish bet"
            >
                <span className="w-4 h-4">
                    <img src="/assets/img/Bear.png" alt="Bear" className="w-full h-full text-[#FF4747]" />
                </span>
                <span className="text-white">Bear</span>
            </Button>
            <Button
                variant="outline"
                onClick={onBullClick}
                className="flex items-center justify-center gap-2 w-full h-10 sm:h-11 bg-transparent rounded-full text-sm sm:text-base border-[#009286] text-[#009286] hover:bg-emerald-700/10"
                aria-label="Bullish bet"
            >
                <span className="w-4 h-4">
                    <img src="/assets/img/Bull.png" alt="Bull" className="w-full h-full text-[#009286]" />
                </span>
                <span className="text-white">Bull</span>
            </Button>
        </div>
    )
}

export default ActionButtons
