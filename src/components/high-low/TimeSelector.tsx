import React from "react"
import CustomSlider from "./Slider"

interface TimeSelectorProps {
    selectedTime: number
    onTimeChange: (timeIndex: number) => void
}

const TimeSelector: React.FC<TimeSelectorProps> = ({ 
    selectedTime, 
    onTimeChange 
}) => {
    // Time values: 2m, 10m, 30m, 1h, 6h, 12h, 24h
    const timeValues = ["2m", "10m", "30m", "1h", "6h", "12h", "24h"]
    const selectedTimeValue = timeValues[selectedTime]
    
    // Calculate expiry time based on selected time
    const getExpiryTime = () => {
        const now = new Date()
        const timeValue = selectedTimeValue
        
        if (timeValue.endsWith('m')) {
            const minutes = parseInt(timeValue)
            return new Date(now.getTime() + minutes * 60 * 1000)
        } else if (timeValue.endsWith('h')) {
            const hours = parseInt(timeValue)
            return new Date(now.getTime() + hours * 60 * 60 * 1000)
        }
        return now
    }
    
    const expiryTime = getExpiryTime()
    
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <div className="flex flex-col">
            <div className="flex flex-col text-[#B6B6B6] text-xs sm:text-sm leading-relaxed">
                <span className="tracking-tighter">Will the BTC at {formatTime(expiryTime)} close:</span>
                <span className="-mt-1 tracking-tighter">
                Higher or Lower than the current price?
                </span>
            </div>
            
            {/* Time Slider */}
            <div className="mt-3 flex justify-center">
                <div className="text-center w-full flex justify-center">
                    <CustomSlider
                        initialValue={selectedTime}
                        onChange={onTimeChange}
                    />
                </div>
            </div>
        </div>
    )
}

export default TimeSelector
