import { useState, useEffect } from "react"
import TimeSelector from "./TimeSelector"
import TriggerDisplay from "./TriggerDisplay"
import AmountInput from "./AmountInput"
import PayoffDisplay from "./PayoffDisplay"
import ActionButtons from "./ActionButtons"

interface HighLowProps {
    currentPrice: number | null
    onTimeChange?: (timeIndex: number) => void
}

const HighLow: React.FC<HighLowProps> = ({ currentPrice, onTimeChange }) => {
    const [selectedTime, setSelectedTime] = useState(0) // default to 2m
    const [amount, setAmount] = useState<string>("")

    // Notify parent component when time changes
    useEffect(() => {
        onTimeChange?.(selectedTime)
    }, [selectedTime, onTimeChange])

    const handleBearClick = () => {
        // Handle bear action
        // console.log('Bear clicked with amount:', amount, 'time:', selectedTime)
    }

    const handleBullClick = () => {
        // Handle bull action
        // console.log('Bull clicked with amount:', amount, 'time:', selectedTime)
    }

    return (
        <div className="flex flex-col mt-3">
            <TimeSelector 
                selectedTime={selectedTime}
                onTimeChange={setSelectedTime}
            />
            
            <TriggerDisplay 
                currentPrice={currentPrice}
                selectedTime={selectedTime}
            />

            <AmountInput 
                amount={amount}
                onAmountChange={setAmount}
            />

            <PayoffDisplay 
                amount={amount}
            />

            <ActionButtons 
                onLowClick={handleBearClick}
                onHighClick={handleBullClick}
            />
        </div>
    )
}

export default HighLow
