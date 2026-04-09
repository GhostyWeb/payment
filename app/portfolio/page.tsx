'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { properties as PROPERTIES } from '@/lib/properties'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  Wallet,
  TrendingUp,
  Building2,
  Coins,
  ExternalLink,
  ArrowUpRight,
  Clock,
  BarChart3,
  PieChart,
  Activity,
  ChevronRight,
  ListRestart,
  Tag,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { SellModal } from '@/components/SellModal'
import { fetchAllUserListings, cancelSaleListing, createSaleListing, lockTokens } from '@/lib/p2p-market'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
} from 'recharts'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { useWallet } from '@/lib/wallet-context'

function formatNum(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatSol(n: number): string {
  return `${n.toFixed(4)} SOL`
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const COLORS = ['#9945ff', '#19fb9b', '#14f195', '#7c3aed', '#a78bfa', '#34d399', '#60a5fa']

export default function PortfolioPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { connected, connect, connecting, publicKey, balance, shortAddress, purchases } = useWallet()
  const [activeListings, setActiveListings] = useState<any[]>([])
  const [isLoadingListings, setIsLoadingListings] = useState(false)
  const [sellModalData, setSellModalData] = useState<{ isOpen: boolean, property: any, tokens: number } | null>(null)
  const [cancelConfirmModal, setCancelConfirmModal] = useState<{ isOpen: boolean, property: any, listingIndex: number } | null>(null)
  const [transactionPage, setTransactionPage] = useState(1)
  const transactionsPerPage = 5

  const refreshListings = async () => {
    if (!connected || !publicKey) return
    setIsLoadingListings(true)
    try {
      const list = await fetchAllUserListings((window as any).phantom?.solana)
      setActiveListings(list)
    } catch (e) {
      console.error('Failed to fetch listings:', e)
    } finally {
      setIsLoadingListings(false)
    }
  }

  useEffect(() => {
    if (connected) refreshListings()
  }, [connected, publicKey])

  // ── Derived stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!purchases.length) return null

    const totalInvested = purchases.reduce((s, p) => s + p.totalSol, 0)
    const uniqueProperties = new Set(purchases.map((p) => p.propertyId)).size
    const totalTokens = purchases.reduce((s, p) => s + p.tokens, 0)
    const avgYield =
      purchases.reduce((s, p) => s + p.annualYield * p.totalSol, 0) / totalInvested

    // Monthly return estimate
    const monthlyReturn = purchases.reduce((s, p) => {
      return s + (p.totalSol * (p.annualYield / 100)) / 12
    }, 0)

    return { totalInvested, uniqueProperties, totalTokens, avgYield, monthlyReturn }
  }, [purchases])

  // ── Portfolio allocation by property ────────────────────────────────────
  const allocation = useMemo(() => {
    const map = new Map<string, { name: string; sol: number; tokens: number }>()
    for (const p of purchases) {
      const existing = map.get(p.propertyId)
      if (existing) {
        existing.sol += p.totalSol
        existing.tokens += p.tokens
      } else {
        map.set(p.propertyId, { name: p.propertyName, sol: p.totalSol, tokens: p.tokens })
      }
    }
    
    // Subtract tokens that are currently listed for sale
    for (const listing of activeListings) {
      const property = PROPERTIES.find(p => p.tokenMint === listing.account.tokenMint.toBase58())
      if (property) {
        const entry = map.get(property.id)
        if (entry) {
          const listedTokens = listing.account.tokenAmount.toNumber()
          entry.tokens = Math.max(0, entry.tokens - listedTokens)
        }
      }
    }
    
    // Filter out properties with 0 tokens and sort by investment
    return Array.from(map.values()).filter(item => item.tokens > 0).sort((a, b) => b.sol - a.sol)
  }, [purchases, activeListings])

  // ── Fake cumulative portfolio value chart ────────────────────────────────
  const growthChart = useMemo(() => {
    if (!stats) return []
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const now = new Date()
    return months.slice(0, now.getMonth() + 1).map((m, i) => ({
      month: m,
      value: parseFloat((stats.totalInvested * (1 + (stats.avgYield / 100) * (i / 12))).toFixed(4)),
    }))
  }, [stats])

  // ── Not connected state ──────────────────────────────────────────────────
  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-16 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6 glow-purple">
              <Wallet className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-3">My Portfolio</h1>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Connect your Solana wallet to view your property token holdings, transaction history, and portfolio performance.
            </p>
            <button
              onClick={connect}
              disabled={connecting}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors glow-purple disabled:opacity-60"
            >
              <Wallet className="w-5 h-5" />
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        {/* Header */}
        <div className="border-b border-border bg-card/50">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">My Portfolio</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-xs font-mono text-muted-foreground">{publicKey}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {balance !== null && (
                <div className="glass px-4 py-2 rounded-xl border border-border flex items-center gap-2">
                  <Coins className="w-4 h-4 text-accent" />
                  <span className="text-sm font-semibold text-foreground">{balance.toFixed(4)} SOL</span>
                  <span className="text-xs text-muted-foreground">devnet balance</span>
                </div>
              )}
              <a
                href={`https://solscan.io/account/${publicKey}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-2 rounded-xl glass border border-border text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Solscan <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">

          {purchases.length === 0 ? (
            /* Empty state */
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">No investments yet</h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Browse our marketplace and invest in your first tokenized property to get started.
              </p>
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors glow-purple"
              >
                Browse Marketplace
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              {/* ── Stats row ────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="glass rounded-2xl p-5 border-glow col-span-2 lg:col-span-1">
                  <div className="flex items-center gap-2 mb-3">
                    <Coins className="w-4 h-4 text-accent" />
                    <span className="text-xs text-muted-foreground">Total Invested</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{formatSol(stats!.totalInvested)}</p>
                  <p className="text-xs text-muted-foreground mt-1">across all properties</p>
                </div>

                <div className="glass rounded-2xl p-5 border-glow">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Properties</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stats!.uniqueProperties}</p>
                  <p className="text-xs text-muted-foreground mt-1">unique assets</p>
                </div>

                <div className="glass rounded-2xl p-5 border-glow">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Total Tokens</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{formatNum(stats!.totalTokens)}</p>
                  <p className="text-xs text-muted-foreground mt-1">SPL tokens held</p>
                </div>

                <div className="glass rounded-2xl p-5 border-glow">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-accent" />
                    <span className="text-xs text-muted-foreground">Avg. Yield</span>
                  </div>
                  <p className="text-2xl font-bold text-accent">{stats!.avgYield.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">annual return</p>
                </div>

                <div className="glass rounded-2xl p-5 border-glow">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-accent" />
                    <span className="text-xs text-muted-foreground">Est. Monthly</span>
                  </div>
                  <p className="text-2xl font-bold text-accent">{formatSol(stats!.monthlyReturn)}</p>
                  <p className="text-xs text-muted-foreground mt-1">rental income</p>
                </div>
              </div>

              {/* ── Charts row ───────────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Portfolio value growth */}
                <div className="lg:col-span-2 glass rounded-2xl p-6 border-glow">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Portfolio Value</h2>
                      <p className="text-xs text-muted-foreground">Projected growth this year</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-lg bg-accent/10 text-accent font-medium">
                      +{stats!.avgYield.toFixed(1)}% APY
                    </span>
                  </div>
                  {mounted ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={growthChart} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                        <defs>
                          <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#9945ff" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#9945ff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="month" tick={{ fill: '#6060a0', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6060a0', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(2)}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#16161f', border: '1px solid rgba(153,69,255,0.3)', borderRadius: '8px', color: '#e8e8f0', fontSize: 12 }}
                          formatter={(v: number) => [`${v.toFixed(4)} SOL`, 'Value']}
                        />
                        <Area type="monotone" dataKey="value" stroke="#9945ff" strokeWidth={2} fill="url(#portfolioGradient)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-[180px] bg-secondary/20 animate-pulse rounded-xl" />
                  )}
                </div>

                {/* Allocation pie */}
                <div className="glass rounded-2xl p-6 border-glow">
                  <div className="mb-4">
                    <h2 className="text-base font-semibold text-foreground">Allocation</h2>
                    <p className="text-xs text-muted-foreground">By property</p>
                  </div>
                  <div className="flex justify-center mb-3">
                    {mounted ? (
                      <RechartsPie width={160} height={160}>
                        <Pie
                          data={allocation}
                          dataKey="sol"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={3}
                        >
                          {allocation.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                      </RechartsPie>
                    ) : (
                      <div className="w-[160px] h-[160px] rounded-full border-[27px] border-secondary/20 animate-pulse" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {allocation.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-muted-foreground truncate max-w-[120px]">{item.name}</span>
                        </div>
                        <span className="text-foreground font-medium">{item.sol.toFixed(3)} SOL</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Holdings table ───────────────────────────────────────── */}
              <div className="glass rounded-2xl border-glow overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">Holdings</h2>
                  <span className="text-xs text-muted-foreground">{allocation.length} properties</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-6 py-3 text-xs text-muted-foreground font-medium">Property</th>
                        <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Tokens</th>
                        <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Invested</th>
                        <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Yield</th>
                        <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Est. Monthly</th>
                        <th className="text-right px-6 py-3 text-xs text-muted-foreground font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocation.map((item, i) => {
                        const relatedPurchase = purchases.find((p) => p.propertyId === purchases.find(
                          (pp) => pp.propertyName === item.name
                        )?.propertyId)
                        const yieldPct = relatedPurchase?.annualYield ?? 0
                        const monthly = (item.sol * (yieldPct / 100)) / 12
                        const propertyId = purchases.find((p) => p.propertyName === item.name)?.propertyId
                        
                        // Check if this property already has an active listing
                        const property = PROPERTIES.find(p => p.id === propertyId)
                        const propertyListing = property ? activeListings.find(listing => 
                          listing.account.tokenMint.toBase58() === property.tokenMint
                        ) : null
                        
                        const hasActiveListing = propertyListing?.account.isActive === true
                        const hasStaleListing = propertyListing && !propertyListing.account.isActive

                        return (
                          <tr key={item.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                            <td className="px-6 py-4">
                              {propertyId ? (
                                <Link href={`/marketplace/${propertyId}`} className="flex items-center gap-3 group">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                  <span className="text-foreground font-medium truncate max-w-[180px] group-hover:text-primary transition-colors">{item.name}</span>
                                </Link>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                  <span className="text-foreground font-medium truncate max-w-[180px]">{item.name}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right text-foreground">{formatNum(item.tokens)}</td>
                            <td className="px-4 py-4 text-right text-foreground">{item.sol.toFixed(4)} SOL</td>
                            <td className="px-4 py-4 text-right text-accent font-semibold">{yieldPct}%</td>
                            <td className="px-4 py-4 text-right text-accent">+{monthly.toFixed(4)} SOL</td>
                            <td className="px-6 py-4 text-right">
                              {propertyId && (
                                <div className="flex items-center justify-end gap-4">
                                  {hasActiveListing ? (
                                    <span className="text-xs text-white/30 font-medium">Listed</span>
                                  ) : hasStaleListing ? (
                                    <span className="text-xs text-red-400 font-bold">Needs Cleanup</span>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        const property = PROPERTIES.find(p => p.id === propertyId)
                                        if (property) {
                                          setSellModalData({
                                            isOpen: true,
                                            property,
                                            tokens: item.tokens
                                          })
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-semibold"
                                    >
                                      Sell
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                      const tokensStr = window.prompt(`How many tokens to lock? (Max: ${item.tokens})`)
                                      if (!tokensStr) return
                                      const tokens = parseInt(tokensStr, 10)
                                      if (isNaN(tokens) || tokens <= 0 || tokens > item.tokens) return alert('Invalid token amount')
                                      
                                      const durationStr = window.prompt(`Lock duration in days? (Options: 30, 90, 180, 365)`)
                                      if (!durationStr) return
                                      const duration = parseInt(durationStr, 10)
                                      if (![30, 90, 180, 365].includes(duration)) return alert('Must be 30, 90, 180, or 365 days')

                                      const wallet = (window as any).phantom?.solana
                                      if (!wallet) return alert('Connect wallet first')

                                      try {
                                        const sig = await lockTokens(wallet, propertyId, tokens, duration)
                                        console.log('Tokens locked:', sig)
                                        toast.success('Tokens locked successfully!', {
                                          description: `${tokens} tokens locked for ${duration} days`
                                        })
                                      } catch (e: any) {
                                        console.error(e)
                                        toast.error('Failed to lock tokens', {
                                          description: e.message
                                        })
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors"
                                  >
                                    Lock
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Active Listings (Selling) ────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-5 h-5 text-accent" />
                    <h2 className="text-xl font-bold text-white tracking-tight">Active Listings</h2>
                  </div>
                  {activeListings.length > 0 && (
                    <span className="text-xs text-accent/60 font-mono bg-accent/5 px-2 py-0.5 rounded-full border border-accent/10">{activeListings.length} For Sale</span>
                  )}
                </div>

                <div className="glass rounded-2xl border-white/5 overflow-hidden shadow-xl">
                  {isLoadingListings ? (
                    <div className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
                      <div className="relative">
                        <Loader2 className="w-8 h-8 animate-spin text-accent" />
                        <div className="absolute inset-0 blur-lg bg-accent/20 animate-pulse" />
                      </div>
                      <span className="text-sm font-medium tracking-wide">Querying SolEstate Market...</span>
                    </div>
                  ) : activeListings.length === 0 ? (
                    <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="w-16 h-16 rounded-3xl bg-white/[0.02] flex items-center justify-center mb-2 border border-white/5 shadow-inner">
                        <Tag className="w-7 h-7 opacity-10" />
                      </div>
                      <span className="text-sm font-semibold text-white/40">No active listings found</span>
                      <p className="text-xs opacity-40 max-w-[200px] text-center leading-relaxed">Your P2P market listings will appear here once confirmed</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-white/[0.02] border-b border-white/5">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] w-[40%]">Investment</th>
                            <th className="px-4 py-4 text-right text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Quantity</th>
                            <th className="px-4 py-4 text-right text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">List Price</th>
                            <th className="px-4 py-4 text-right text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Est. Return</th>
                            <th className="px-6 py-4 text-right text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Control</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeListings.map((listing, idx) => {
                           const property = PROPERTIES.find(p => p.tokenMint === listing.account.tokenMint.toBase58())
                             const tokens = listing.account.tokenAmount.toNumber()
                             const pricePerToken = listing.account.pricePerTokenLamports.toNumber() / 1e9
                             const total = (tokens * pricePerToken).toFixed(4)

                             return (
                               <tr key={idx} className="border-b border-white/5 hover:bg-white/[0.01] transition-all group">
                                 <td className="px-6 py-5">
                                   <div className="flex items-center gap-4">
                                      <div className="w-10 h-10 rounded-xl overflow-hidden relative border border-white/10 shadow-lg shrink-0">
                                        <Image src={property?.image ?? ''} alt={property?.name ?? 'Unknown'} fill className="object-cover group-hover:scale-110 transition-transform duration-500" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-bold text-white truncate">{property?.name ?? 'Unknown Asset'}</p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                          {listing.account.isActive ? (
                                            <>
                                              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                                              <span className="text-[10px] text-accent font-mono tracking-wider">LISTED ON SECONDARY</span>
                                            </>
                                          ) : (
                                            <>
                                              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                              <span className="text-[10px] text-red-500 font-mono tracking-wider">STALE / NEEDS CLEANUP</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                   </div>
                                 </td>
                                 <td className="px-4 py-5 text-right font-mono text-sm text-white/80">{tokens} <span className="text-[10px] text-white/20 ml-0.5">SHR</span></td>
                                 <td className="px-4 py-5 text-right font-mono text-sm text-accent">{pricePerToken.toFixed(3)} <span className="text-[10px] opacity-60">SOL</span></td>
                                 <td className="px-4 py-5 text-right font-mono text-sm text-white">{total} <span className="text-[10px] opacity-40">SOL</span></td>
                                 <td className="px-6 py-5 text-right">
                                   <button 
                                     onClick={() => {
                                       setCancelConfirmModal({ isOpen: true, property, listingIndex: idx })
                                     }}
                                     className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-white/5 text-white/40 hover:bg-red-500/20 hover:text-red-400 transition-all border border-transparent hover:border-red-500/30"
                                   >
                                      {listing.account.isActive ? "CANCEL LISTING" : "CLEANUP STALE LISTING"}
                                   </button>
                                 </td>
                               </tr>
                             )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Transaction history ────────────────��──��──���───────────── */}
              <div className="glass rounded-2xl border-glow overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">Transaction History</h2>
                  <span className="text-xs text-muted-foreground">{purchases.length} transactions</span>
                </div>
                <div className="divide-y divide-border/50">
                  {purchases
                    .slice((transactionPage - 1) * transactionsPerPage, transactionPage * transactionsPerPage)
                    .map((p: any) => (
                    <div key={p.id} className="flex items-center gap-4 px-6 py-4 hover:bg-secondary/20 transition-colors">
                      {/* Property thumbnail */}
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0">
                        <Image src={p.propertyImage} alt={p.propertyName} fill className="object-cover" />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">BUY</span>
                          <span className="text-sm font-medium text-foreground truncate">{p.propertyName}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">{p.propertyLocation}</span>
                          <span className="text-xs text-muted-foreground">{formatNum(p.tokens)} tokens</span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">{p.totalSol.toFixed(4)} SOL</p>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{timeAgo(p.timestamp)}</span>
                        </div>
                      </div>

                      {/* Solscan link */}
                      <a
                        href={`https://solscan.io/tx/${p.signature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-2 rounded-lg glass border border-border hover:border-primary/50 transition-colors"
                        title="View on Solscan"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
                      </a>
                    </div>
                  ))}
                </div>
                
                {/* Pagination */}
                {purchases.length > transactionsPerPage && (
                  <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                    <button
                      onClick={() => setTransactionPage(prev => Math.max(1, prev - 1))}
                      disabled={transactionPage === 1}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-muted-foreground">
                      Page {transactionPage} of {Math.ceil(purchases.length / transactionsPerPage)}
                    </span>
                    <button
                      onClick={() => setTransactionPage(prev => Math.min(Math.ceil(purchases.length / transactionsPerPage), prev + 1))}
                      disabled={transactionPage >= Math.ceil(purchases.length / transactionsPerPage)}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* ── Explore more CTA ─────────────────────────────────────── */}
              <div className="glass rounded-2xl p-6 border-glow flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Ready to diversify?</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Browse more tokenized properties and grow your portfolio.</p>
                </div>
                <Link
                  href="/marketplace"
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors glow-purple whitespace-nowrap"
                >
                  Browse Marketplace
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />

      {sellModalData && (
        <SellModal
          isOpen={sellModalData.isOpen}
          onClose={() => setSellModalData(null)}
          property={sellModalData.property}
          maxTokens={sellModalData.tokens}
          onSell={async (amt, prc) => {
            const wallet = (window as any).phantom?.solana
            const priceLamports = Math.floor(prc * 1e9)
            try {
              await createSaleListing(wallet, sellModalData.property.id, amt, priceLamports)
              toast.success('Successfully listed for sale!', {
                description: `${amt} tokens listed at ${prc} SOL each. Check Active Listings below.`
              })
              setSellModalData(null)
              // Wait a bit for blockchain to process, then refresh
              setTimeout(async () => {
                await refreshListings()
              }, 1500)
            } catch (e: any) {
              toast.error('Failed to create listing', {
                description: e.message
              })
              throw e
            }
          }}
        />
      )}

      {/* Cancel Listing Confirmation Modal */}
      {cancelConfirmModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {activeListings[cancelConfirmModal.listingIndex]?.account?.isActive ? 'Cancel Listing?' : 'Cleanup Stale Listing?'}
                </h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  {activeListings[cancelConfirmModal.listingIndex]?.account?.isActive 
                    ? 'Are you sure you want to delist these tokens?'
                    : 'This is a stale record blocking new sales. Cleanup will close the account and refund SOL.'}
                </p>
              </div>
            </div>

            {cancelConfirmModal.property && (
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg overflow-hidden relative border border-white/10">
                    <Image 
                      src={cancelConfirmModal.property.image} 
                      alt={cancelConfirmModal.property.name} 
                      fill 
                      className="object-cover" 
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{cancelConfirmModal.property.name}</p>
                    <p className="text-xs text-white/40 font-mono">{cancelConfirmModal.property.location}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setCancelConfirmModal(null)}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all border border-white/10"
              >
                Отмена
              </button>
              <button
                onClick={async () => {
                  const wallet = (window as any).phantom?.solana
                  const property = cancelConfirmModal.property
                  try {
                    if (property) {
                      const result = await cancelSaleListing(wallet, property.id)
                      
                      if (result === 'success_with_error') {
                        toast.success('Listing cancelled!', {
                          description: 'Your tokens have been returned. Note: Due to a smart contract limitation, the listing account remains on-chain but is now inactive.'
                        })
                      } else {
                        toast.success('Listing cancelled!', {
                          description: 'Your tokens have been returned to your wallet'
                        })
                      }
                      
                      setCancelConfirmModal(null)
                      
                      // Immediately filter out the cancelled listing from UI
                      setActiveListings(prev => prev.filter(l => 
                        l.account.tokenMint.toBase58() !== property.tokenMint
                      ))
                      
                      // Wait longer for blockchain to finalize, then refresh
                      setTimeout(async () => {
                        await refreshListings()
                      }, 5000)
                    }
                  } catch (e: any) {
                    console.error('[v0] Cancel listing error:', e)
                    toast.error('Failed to cancel listing', {
                      description: e.message || 'Please try again'
                    })
                  }
                }}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all border border-red-500/30"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
