import Header from "@/components/layout/Header";
import Navbar from "@/components/layout/Navbar";
import { useNavigation } from "@/contexts/NavigationContext";
import BullBear from "@/components/bull-bear/Index";
import HighLow from "@/components/high-low/Index";
import BTCRealtimeChart from "@/components/BTCRealtimeChart";
import { TradingPositionsTable } from "@/components/TradingTable";
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

const Index = () => {
  const { activeTab } = useNavigation();
  const [currentTime, setCurrentTime] = useState<string>("--:--:--")
  const [currentPrice, setCurrentPrice] = useState<number | null>(45000) // Mock price for now
  const [selectedTime, setSelectedTime] = useState<number>(0) // default to 2m
  const [isHighLowSelected, setIsHighLowSelected] = useState<boolean>(false)
  const [currentPercent, setCurrentPercent] = useState<number>(0.02) // Track current percentage

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

  // Update isHighLowSelected when activeTab changes
  useEffect(() => {
    setIsHighLowSelected(activeTab === 'high-low')
  }, [activeTab])

  const handleTimeChange = (newTime: number) => {
    setSelectedTime(newTime)
  }

  const handlePercentageChange = (newPercent: number) => {
    setCurrentPercent(newPercent)
  }

  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'bull-bear':
        return (
          <BullBear 
            currentPrice={currentPrice} 
            onPercentageChange={handlePercentageChange}
          />
        );
      case 'high-low':
        return (
          <HighLow 
            currentPrice={currentPrice} 
            onTimeChange={handleTimeChange}
          />
        );
      case 'lend-borrow':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold mb-4 text-white">Lend/Borrow</h2>
            <p className="text-gray-400">This feature is coming soon!</p>
          </div>
        );
      case 'futures':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold mb-4 text-white">Futures</h2>
            <p className="text-gray-400">This feature is coming soon!</p>
          </div>
        );
      case 'forwards':
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold mb-4 text-white">Forwards</h2>
            <p className="text-gray-400">This feature is coming soon!</p>
          </div>
        );
      default:
        return (
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold mb-4 text-white">Select a trading option</h2>
            <p className="text-gray-400">Choose from the navigation above</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#131313]">
      <Header />
      <div className="flex items-center justify-center my-6">
        <Navbar />
      </div>
      <main className="lg:max-w-[1360px] m-auto px-4">
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
              </div>
              {renderActiveComponent()}
            </div>

            {/* Right Panel */}
            <div className="relative flex flex-1 w-full border-t md:border-t-0 md:border-l border-[#A0A0A0] p-4 sm:p-6 min-h-[400px]">
              <BTCRealtimeChart
                percent={currentPercent/100} // Dynamic percentage from BullBear component
                height={450}
                onPrice={setCurrentPrice}
                showBullBearTriggers={!isHighLowSelected}
              />

              {/* Time */}
              <div className="absolute bottom-2 right-6 md:bottom-6 md:right-8 z-20 text-xs sm:text-sm flex items-center gap-2 text-white">
                <img src="/assets/img/Clock.png" className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="tabular-nums tracking-tight">{currentTime}</span>
              </div>
            </div>
          </div>
        </Card>
        <div className="mt-4">
          <TradingPositionsTable />
        </div>
      </main>
    </div>
  );
};

export default Index;
