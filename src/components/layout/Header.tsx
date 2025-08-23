import { Button } from "@/components/ui/button"

const Header = () => {
  return (
    <header className="sticky top-0 flex z-20 items-center justify-between px-4 sm:px-6 py-3 bg-background border-b border-gray-200 bg-white">

      <div className="w-[1360px] m-auto flex justify-between items-center">
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-2">
            <img
              src="/assets/img/logo.png"
              alt="logo"
              className="w-24 h-auto sm:w-32 md:w-40 lg:w-[171px] ml-1 sm:ml-2"
            />
          </div>
        </div>

        <Button
          variant="outline"
          className="border-none text-sm sm:text-base tracking-tight text-white rounded-full bg-[#009286] hover:text-gray-50 hover:bg-[#12d1c1] px-4 py-2 sm:px-6 sm:py-3 h-auto min-w-[120px] sm:min-w-[140px] md:w-[164px] md:h-[42px]"
        >
          <span className="hidden sm:inline">Connect Wallet</span>
          <span className="sm:hidden">Connect</span>
        </Button>
      </div>
    </header>
  )
}

export default Header
