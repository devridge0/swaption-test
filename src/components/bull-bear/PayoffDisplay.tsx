import React from "react"

interface PayoffDisplayProps {
    amount: string
}

const PayoffDisplay: React.FC<PayoffDisplayProps> = ({ amount }) => {
    // Calculate payoff based on amount and 80% return rate
    const calculatePayoff = () => {
        const numAmount = parseFloat(amount) || 0
        const returnRate = 0.80 // 80%

        // In the money (winning scenario): get back original amount + 80% return
        const outOfTheMoney = numAmount + (numAmount * returnRate)

        // Out of the money (losing scenario): lose the original amount
        const inTheMoney = 0

        return {
            inTheMoney,
            outOfTheMoney,
            returnPercentage: returnRate * 100
        }
    }

    const payoff = calculatePayoff()

    return (
        <div className="mt-3">
            <div className="text-white text-sm tracking-tighter mb-2">Pay-off</div>
            <div className="text-xs sm:text-sm -mt-1 space-y-1">
                <div className="flex items-center justify-between text-[#B6B6B6]">
                    <span className="tracking-tighter">
                        In the money:
                    </span>
                    <span className="tabular-nums tracking-tighter">
                        ${amount} (0%)
                    </span>
                </div>
                <div className="flex items-center justify-between text-[#B6B6B6]">
                    <span className="tracking-tighter">
                        Out of the money:
                    </span>
                    <span className="tabular-nums tracking-tighter">
                        ${payoff.outOfTheMoney.toFixed(2)} ({payoff.returnPercentage.toFixed(0)}%)
                    </span>
                </div>
            </div>
        </div>
    )
}

export default PayoffDisplay
