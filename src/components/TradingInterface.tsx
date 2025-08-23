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

    // Debug price updates
    useEffect(() => {
        if (currentPrice) {
            console.log('Current Bitcoin price updated:', currentPrice);
        }
    }, [currentPrice]);

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
                    <div className="mt-5 flex justify-center">
                        <div className="text-center w-full flex justify-center">
                            <CustomSlider
                                initialValue={percentage}
                                onChange={(value) => setPercentage(value)}
                            />
                        </div>
                    </div>

                    {/* Amount */}
                    <div className="mt-5 flex justify-center items-center">
                        <Input
                            placeholder="Amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="bg-white text-gray-900 outline-none focus:border-green-500 placeholder-gray-500 px-3 py-2 rounded-xl text-sm sm:text-base font-medium border-0 w-full max-w-sm h-[48px] sm:h-[52px]"
                            aria-label="amount"
                        />
                    </div>

                    {/* Return */}
                    <div className="mt-5">
                        <div className="text-white text-sm tracking-tighter mb-2">Return</div>
                        <div className="text-xs sm:text-sm -mt-1 space-y-1">
                                                         <div className="flex items-center justify-between text-[#B6B6B6]">
                                 <span className="tracking-tighter">
                                     In the money ({currentPrice ? currentPrice.toLocaleString('en-US', { 
                                         minimumFractionDigits: 2, 
                                         maximumFractionDigits: 2 
                                     }) : "Loading..."}):
                                 </span>
                                 <span className="tabular-nums tracking-tighter">$0.00 (0%)</span>
                             </div>
                             <div className="flex items-center justify-between text-[#B6B6B6]">
                                 <span className="tracking-tighter">
                                     Out of the money ({currentPrice ? currentPrice.toLocaleString('en-US', { 
                                         minimumFractionDigits: 2, 
                                         maximumFractionDigits: 2 
                                     }) : "Loading..."}):
                                 </span>
                                 <span className="tabular-nums tracking-tighter">$0.00 (80%)</span>
                             </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3 mt-5">
                        <Button
                            variant="outline"
                            className="flex items-center justify-center gap-2 w-full h-10 sm:h-11 bg-transparent rounded-full text-sm sm:text-base border-[#FF4747] text-[#FF4747] hover:bg-red-500/10"
                            aria-label="Bearish bet"
                        >
                            <span className="text-[#FF4747]">↓</span>
                            <span className="text-white">Bear</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="flex items-center justify-center gap-2 w-full h-10 sm:h-11 bg-transparent rounded-full text-sm sm:text-base border-[#009286] text-[#009286] hover:bg-emerald-700/10"
                            aria-label="Bullish bet"
                        >
                            <span className="text-[#009286]">↑</span>
                            <span className="text-white">Bull</span>
                        </Button>
                    </div>
                </div>

                {/* Right Panel */}
                <div className="relative flex flex-1 w-full border-t md:border-t-0 md:border-l border-[#A0A0A0] p-4 sm:p-6 min-h-[400px]">
                    <BTCRealtimeChart 
                        percent={percentage/100} 
                        height={400} 
                        onPrice={setCurrentPrice}
                    />

                    {/* Time */}
                    <div className="absolute bottom-4 right-4 z-20 text-xs sm:text-sm flex items-center gap-2 text-white">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="tabular-nums tracking-tight">{currentTime}</span>
                    </div>
                </div>
            </div>
        </Card>
    )
}

export default TradingInterface
