import React from "react"
import CustomSlider from "./Slider"

interface PercentageSelectorProps {
    percentage: number
    onPercentageChange: (percentage: number) => void
}

const PercentageSelector: React.FC<PercentageSelectorProps> = ({ 
    percentage, 
    onPercentageChange 
}) => {
    return (
        <div className="flex flex-col">
            <div className="flex flex-col text-[#B6B6B6] text-xs sm:text-sm leading-relaxed">
                <span className="tracking-tighter">Which will Bitcoin reach first:</span>
                <span className="-mt-1 tracking-tighter">
                    +{percentage}% above its current price or -{percentage}% below?
                </span>
            </div>
            
            {/* Percentage Slider */}
            <div className="mt-3 flex justify-center">
                <div className="text-center w-full flex justify-center">
                    <CustomSlider
                        initialValue={percentage}
                        onChange={onPercentageChange}
                    />
                </div>
            </div>
        </div>
    )
}

export default PercentageSelector
