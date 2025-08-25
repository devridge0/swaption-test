import { useState, useEffect } from "react"
import PercentageSelector from "./PercentageSelector"
import TriggerDisplay from "./TriggerDisplay"
import AmountInput from "./AmountInput"
import PayoffDisplay from "./PayoffDisplay"
import ActionButtons from "./ActionButtons"

interface BullBearProps {
    currentPrice: number | null
    onPercentageChange?: (percentage: number) => void
}

const BullBear: React.FC<BullBearProps> = ({ currentPrice, onPercentageChange }) => {
    const [percentage, setPercentage] = useState(1) // default 1%
    const [amount, setAmount] = useState<string>("")

    // Notify parent component when percentage changes
    useEffect(() => {
        onPercentageChange?.(percentage)
    }, [percentage, onPercentageChange])

    const handleBearClick = () => {
        // Handle bear action
        console.log('Bear clicked with amount:', amount, 'percentage:', percentage)
    }

    const handleBullClick = () => {
        // Handle bull action
        console.log('Bull clicked with amount:', amount, 'percentage:', percentage)
    }

    return (
        <div className="flex flex-col mt-3">
            <PercentageSelector 
                percentage={percentage}
                onPercentageChange={setPercentage}
            />
            
            <TriggerDisplay 
                currentPrice={currentPrice}
                percentage={percentage}
            />

            <AmountInput 
                amount={amount}
                onAmountChange={setAmount}
            />

            <PayoffDisplay 
                amount={amount}
            />

            <ActionButtons 
                onBearClick={handleBearClick}
                onBullClick={handleBullClick}
            />
        </div>
    )
}

export default BullBear
