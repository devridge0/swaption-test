import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Clock } from "lucide-react"
import CustomSlider from "./Slider"
import BTCRealtimeChart from "./BTCRealtimeChart"

type SliderValue = number[] // shadcn/ui Slider uses number[]

const TradingInterface: React.FC = () => {
    const [percentage, setPercentage] = useState(1) // default 1%
    const [amount, setAmount] = useState<string>("")
    const [currentTime, setCurrentTime] = useState<string>("--:--:--")
    const [currentPrice, setCurrentPrice] = useState<number | null>(null)

    // Calculate payoff based on amount and 80% return rate
    const calculatePayoff = () => {
        const numAmount = parseFloat(amount) || 0
        const returnRate = 0.80 // 80%
        
        // In the money (winning scenario): get back original amount + 80% return
        const inTheMoney = numAmount + (numAmount * returnRate)
        
        // Out of the money (losing scenario): lose the original amount
        const outOfTheMoney = 0
        
        return {
            inTheMoney,
            outOfTheMoney,
            returnPercentage: returnRate * 100
        }
    }

    const payoff = calculatePayoff()

    // safer interval
    useEffect(() => {
        const tick = () => {
            const now = new Date()
            setCurrentTime(now.toLocaleTimeString("en-US", { hour12: false }))
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    return (
        <Card className="bg-[#1D1D1D] border rounded-3xl overflow-hidden border-[#A0A0A0] w-full max-w-full h-auto">
            <div className="flex flex-col md:flex-row w-full h-auto">
                {/* Left Panel */}
                <div className="w-full md:max-w-[362px] p-4 sm:p-5 md:p-6 border-b md:border-b-0 border-[#A0A0A0] flex-shrink-0">
                    {/* Header */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                                <img
                                    src="/assets/img/Bitcoin.png"
                                    className="w-6 h-6 shrink-0"
                                    alt="Bitcoin"
                                />
                                <div className="text-white text-sm sm:text-base md:text-lg leading-none truncate">
                                    BTC/USDT
                                </div>
                            </div>
                            <div className="flex items-center text-base sm:text-lg md:text-xl text-white font-bold">
                                <span className="tracking-wider">
                                    {currentPrice ? (
                                        currentPrice.toLocaleString('en-US', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2
                                        })
                                    ) : (
                                        <span className="text-gray-400">Loading...</span>
                                    )}
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-col text-[#B6B6B6] text-xs sm:text-sm leading-relaxed">
                            <span className="tracking-tighter">Which will Bitcoin reach first:</span>
                            <span className="-mt-1 tracking-tighter">
                                +{percentage}% above its current price or -{percentage}% below?
                            </span>
                        </div>
                    </div>

                    {/* Percentage */}
                    <div className="mt-3 flex justify-center">
                        <div className="text-center w-full flex justify-center">
                            <CustomSlider
                                initialValue={percentage}
                                onChange={(value) => setPercentage(value)}
                            />
                        </div>
                    </div>
                    <div className="mt-8 flex items-center justify-between text-[#B6B6B6]">
                        <div className="flex flex-col">
                            <span className="tracking-tighter">
                                Bear trigger:
                            </span>
                            <span className="font-medium tracking-tighter text-[#FF4747]">
                                {currentPrice ? (
                                    (currentPrice * (1 - percentage / 100)).toLocaleString('en-US', {
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
                                {currentPrice ? (
                                    (currentPrice * (1 + percentage / 100)).toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    })
                                ) : (
                                    <span className="text-gray-400">--</span>
                                )}
                            </span>
                        </div>
                    </div>

                    {/* Amount */}
                    <div className="mt-3 flex justify-center items-center">
                        <Input
                            placeholder="USDT"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="bg-white text-gray-900 outline-none focus:border-green-500 placeholder-gray-500 px-3 py-2 rounded-xl text-sm sm:text-base font-medium border-0 w-full max-w-sm h-[48px] sm:h-[52px]"
                            aria-label="amount"
                            autoFocus
                        />
                    </div>

                    {/* Amount Select Buttons */}
                    <div className="mt-3 flex justify-center items-center">
                        <div className="flex gap-2">
                            {[10, 50, 100, 500, 1000].map((value) => (
                                <Button
                                    key={value}
                                    variant="outline"
                                    onClick={() => setAmount(value.toString())}
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

                    {/* Return */}
                    <div className="mt-3">
                        <div className="text-white text-sm tracking-tighter mb-2">Pay off</div>
                        <div className="text-xs sm:text-sm -mt-1 space-y-1">
                            <div className="flex items-center justify-between text-[#B6B6B6]">
                                <span className="tracking-tighter">
                                    In the money ({currentPrice ? currentPrice.toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    }) : "Loading..."}):
                                </span>
                                <span className="tabular-nums tracking-tighter">${payoff.inTheMoney.toFixed(2)} ({payoff.returnPercentage.toFixed(0)}%)</span>
                            </div>
                            <div className="flex items-center justify-between text-[#B6B6B6]">
                                <span className="tracking-tighter">
                                    Out of the money ({currentPrice ? currentPrice.toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    }) : "Loading..."}):
                                </span>
                                <span className="tabular-nums tracking-tighter">${payoff.outOfTheMoney.toFixed(2)} (0%)</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3 mt-3">
                        <Button
                            variant="outline"
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
                            className="flex items-center justify-center gap-2 w-full h-10 sm:h-11 bg-transparent rounded-full text-sm sm:text-base border-[#009286] text-[#009286] hover:bg-emerald-700/10"
                            aria-label="Bullish bet"
                        >
                            <span className="w-4 h-4">
                                <img src="/assets/img/Bull.png" alt="Bull" className="w-full h-full text-[#009286]" />
                            </span>
                            <span className="text-white">Bull</span>
                        </Button>
                    </div>
                </div>

                {/* Right Panel */}
                <div className="relative flex flex-1 w-full border-t md:border-t-0 md:border-l border-[#A0A0A0] p-4 sm:p-6 min-h-[400px]">
                    <BTCRealtimeChart
                        percent={percentage / 100}
                        height={450}
                        onPrice={setCurrentPrice}
                    />

                    {/* Time */}
                    <div className="absolute bottom-2 right-6 md:bottom-6 md:right-8 z-20 text-xs sm:text-sm flex items-center gap-2 text-white">
                        <img src="/assets/img/Clock.png" className="w-3 h-3 sm:w-4 sm:h-4" />    
                        <span className="tabular-nums tracking-tight">{currentTime}</span>
                    </div>
                </div>
            </div>
        </Card>
    )
}

export default TradingInterface
