import Header from "@/components/layout/Header";
import Navbar from "@/components/layout/Navbar";
import TradingInterface from "@/components/TradingInterface";
import { TradingPositionsTable } from "@/components/TradingTable";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#131313]">
      <Header />
      <div className="flex items-center justify-center my-6">
        <Navbar />
      </div>
      <main className="lg:max-w-[1360px] m-auto px-4">
        {/* Main trading interface */}
        <div className="flex gap-6 mb-8">
          <TradingInterface />
        </div>
        <div>
          <TradingPositionsTable />
        </div>
      </main>
    </div>
  );
};

export default Index;
