import React from "react"

interface TriggerDisplayProps {
    currentPrice: number | null
    percentage: number
}

const TriggerDisplay: React.FC<TriggerDisplayProps> = ({ 
    currentPrice, 
    percentage 
}) => {
    const bearTrigger = currentPrice ? (currentPrice * (1 - percentage / 100)) : null
    const bullTrigger = currentPrice ? (currentPrice * (1 + percentage / 100)) : null

    return (
        <div className="mt-8 flex items-center justify-between text-[#B6B6B6]">
            <div className="flex flex-col">
                <span className="tracking-tighter">
                    Bear trigger:
                </span>
                <span className="font-medium tracking-tighter text-[#FF4747]">
                    {bearTrigger ? (
                        bearTrigger.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })
                    ) : (
                        <span className="text-gray-400">--</span>
                    )}
                </span>
            </div>
            <div className="flex flex-col items-end">
                <span className="tracking-tighter">
                    Bull trigger:
                </span>
                <span className="font-medium tracking-tighter text-[#009286]">
                    {bullTrigger ? (
                        bullTrigger.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })
                    ) : (
                        <span className="text-gray-400">--</span>
                    )}
                </span>
            </div>
        </div>
    )
}

export default TriggerDisplay
