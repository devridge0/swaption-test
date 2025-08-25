"use client"

import { useState } from "react"
import { useNavigation } from "@/contexts/NavigationContext"

const tabs = [
    { id: "bull-bear", label: "Bull/Bear" },
    { id: "high-low", label: "High/Low" },
    { id: "lend-borrow", label: "Lend/Borrow" },
    { id: "futures", label: "Futures" },
    { id: "forwards", label: "Forwards" },
]

const Navbar = () => {
    const { activeTab, setActiveTab, navigateToTab } = useNavigation()
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)

    const activeTabObj = tabs.find((tab) => tab.id === activeTab)
    const inactiveTabs = tabs.filter((tab) => tab.id !== activeTab)

    const handleTabClick = (tabId: string) => {
        navigateToTab(tabId)
        setIsDropdownOpen(false) // Close dropdown when tab is selected
    }

    return (
        <div className="relative">
            <nav className="hidden min-[600px]:inline-flex border md:flex justify-center items-center rounded-full gap-1 w-[498px] h-[42px] border-[#474747]">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => navigateToTab(tab.id)}
                        className={`
                px-4 py-[5px] rounded-full text-[15px] h-[42px] tracking-tight
                ${activeTab === tab.id ? "bg-white text-black" : "text-white opacity-50 hover:text-gray-200"}
              `}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            <nav className="inline-flex min-[600px]:hidden border rounded-full gap-1 h-[42px] border-[#474747] relative">
                {/* Active tab button */}
                <button className="px-4 py-[5px] rounded-full text-[15px] h-full tracking-tight bg-white text-black">
                    {activeTabObj?.label}
                </button>

                {/* Three dots dropdown button */}
                <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="px-3 py-[5px] rounded-full text-[15px] h-full tracking-tight text-white opacity-50 hover:text-gray-200 flex items-center justify-center"
                    aria-label="More options"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="3" cy="8" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="13" cy="8" r="1.5" />
                    </svg>
                </button>

                {/* Dropdown menu */}
                {isDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 bg-black border border-[#474747] rounded-lg shadow-lg z-10 min-w-[140px]">
                        {inactiveTabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabClick(tab.id)}
                                className="block w-full px-4 py-2 text-left text-[15px] text-white opacity-50 hover:opacity-100 hover:bg-gray-800 first:rounded-t-lg last:rounded-b-lg"
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}
            </nav>

            {isDropdownOpen && <div className="fixed inset-0 z-0" onClick={() => setIsDropdownOpen(false)} />}
        </div>
    )
}

export default Navbar
