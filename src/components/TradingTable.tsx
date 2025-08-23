"use client"

import { useState } from "react"
import { ExternalLink, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Position {
  id: string
  product: string
  price: number
  amount: number
  side: "Higher" | "Lower"
  duration: string
  percentage: string | null
  inTheMoney: { amount: number; percentage: number }
  outOfTheMoney: { amount: number; percentage: number }
}

const mockPositions: Position[] = [
  {
    id: "1",
    product: "Higher/Lower",
    price: 113338.05,
    amount: 1000,
    side: "Higher",
    duration: "Today 12:30",
    percentage: null,
    inTheMoney: { amount: 0, percentage: 80 },
    outOfTheMoney: { amount: 0, percentage: 0 },
  },
]

export function TradingPositionsTable() {
  const [activeTab, setActiveTab] = useState<"positions" | "volumes">("positions")

  return (
    <div className="w-full text-white">
      {/* Tab Headers */}
      <div className="flex border-b gap-4 border-[#A0A0A0]">
        <button
          onClick={() => setActiveTab("positions")}
          className={`py-3 font-medium text-xs transition-colors relative ${activeTab === "positions" ? "text-white border-b-2 border-teal-400" : "text-gray-400 hover:text-gray-300"
            }`}
        >
          OPEN POSITIONS
        </button>
        <button
          onClick={() => setActiveTab("volumes")}
          className={`py-3 font-medium text-xs transition-colors relative ${activeTab === "volumes" ? "text-white border-b-2 border-teal-400" : "text-gray-400 hover:text-gray-300"
            }`}
        >
          GLOBAL VOLUMES
        </button>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="min-w-[1200px] relative">
          <Table>
            <TableHeader>
              <TableRow className="border-[#A0A0A0] hover:bg-transparent">
                <TableHead className="sticky left-0 text-left  text-sm font-medium text-gray-400">
                  Product
                </TableHead>
                <TableHead className="text-left  text-sm text-gray-400">Price</TableHead>
                <TableHead className="text-left  text-sm text-gray-400">Amount</TableHead>
                <TableHead className="text-left  text-sm text-gray-400">Side</TableHead>
                <TableHead className="text-left  text-sm text-gray-400">Duration</TableHead>
                <TableHead className="text-left  text-sm text-gray-400">Percentage</TableHead>
                <TableHead className="text-left  text-sm text-gray-400">In the money</TableHead>
                <TableHead className="text-left  text-sm text-gray-400">Out of the money</TableHead>
                <TableHead className="text-left  text-sm text-gray-400">TxID</TableHead>
                <TableHead className="text-left  text-sm text-gray-400">Close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockPositions.map((position) => (
                <TableRow key={position.id} className="border-[#A0A0A0] hover:bg-[#1D1D1D]">
                  <TableCell className="sticky left-0 text-sm py-4 text-white font-medium group-hover:bg-[#1D1D1D]">
                    {position.product}
                  </TableCell>
                  <TableCell className="text-sm py-4 text-white">
                    {position.price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className=" text-sm py-4 text-white">{position.amount.toLocaleString()}</TableCell>
                  <TableCell className=" text-sm py-4">
                    <span className="text-[#009286] font-medium">{position.side}</span>
                  </TableCell>
                  <TableCell className=" text-sm py-4 text-white">{position.duration}</TableCell>
                  <TableCell className=" text-sm py-4 text-white">{position.percentage || "-"}</TableCell>
                  <TableCell className=" text-sm py-4 text-white">
                    ${position.inTheMoney.amount.toFixed(2)} ({position.inTheMoney.percentage}%)
                  </TableCell>
                  <TableCell className=" text-sm py-4 text-white">
                    ${position.outOfTheMoney.amount.toFixed(2)} ({position.outOfTheMoney.percentage}%)
                  </TableCell>
                  <TableCell className=" py-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-white font-bold hover:text-white hover:bg-gray-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell className=" py-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-white font-bold hover:text-red-400 hover:bg-gray-800"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Empty state when no positions */}
      {mockPositions.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-400">No open positions</p>
        </div>
      )}
    </div>
  )
}
