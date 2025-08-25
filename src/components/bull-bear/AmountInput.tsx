import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface AmountInputProps {
    amount: string
    onAmountChange: (amount: string) => void
}

const AmountInput: React.FC<AmountInputProps> = ({ 
    amount, 
    onAmountChange 
}) => {
    const quickAmounts = [10, 50, 100, 500, 1000]

    return (
        <div className="flex flex-col">
            {/* Amount Input */}
            <div className="mt-3 flex justify-center items-center">
                <Input
                    placeholder="USDT"
                    value={amount}
                    onChange={(e) => onAmountChange(e.target.value)}
                    className="bg-white text-gray-900 outline-none focus:border-green-500 placeholder-gray-500 px-3 py-2 rounded-xl text-sm sm:text-base font-medium border-0 w-full max-w-sm h-[48px] sm:h-[52px]"
                    aria-label="amount"
                    autoFocus
                />
            </div>

            {/* Amount Select Buttons */}
            <div className="mt-3 flex justify-center items-center">
                <div className="flex gap-2">
                    {quickAmounts.map((value) => (
                        <Button
                            key={value}
                            variant="outline"
                            onClick={() => onAmountChange(value.toString())}
                            className={`flex items-center justify-center text-white md:w-[56px] h-[21px] rounded-full text-xs font-medium transition-all ${
                                amount === value.toString()
                                    ? 'bg-[#ffffff]/10 border-white hover:bg-[#ffffff]/10 text-white'
                                    : 'bg-transparent border-[#A0A0A0] hover:bg-[#ffffff]/10 hover:border-white hover:text-white'
                            }`}
                        >
                            {value}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default AmountInput
