import React from "react"

interface TriggerDisplayProps {
    currentPrice: number | null
    selectedTime: number
}

const TriggerDisplay: React.FC<TriggerDisplayProps> = ({ 
    currentPrice, 
    selectedTime 
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
    
    const currentTime = new Date()
    const expiryTime = getExpiryTime()
    
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    }

    return (
        <div className="mt-8 flex items-center justify-between">
            <div className="flex flex-col">
                <span className="tracking-tighter">
                    Current Time:
                </span>
                <span className="font-medium tracking-tighter">
                    {formatTime(currentTime)}
                </span>
            </div>
            <div className="flex flex-col items-end">
                <span className="tracking-tighter">
                    Expiry time:
                </span>
                <span className="font-medium tracking-tighter">
                    {formatTime(expiryTime)}
                </span>
            </div>
        </div>
    )
}

export default TriggerDisplay
