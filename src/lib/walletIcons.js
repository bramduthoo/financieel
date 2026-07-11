import { createElement } from 'react'
import {
  Wallet, Home, Zap, Droplets, Car, Plane, Shirt, Heart, TrendingUp,
  ShoppingCart, PiggyBank, Sparkles,
} from 'lucide-react'

// Stored `wallets.icon` value → lucide component. Keys are the picker choices.
export const WALLET_ICONS = {
  wallet:         Wallet,
  home:           Home,
  zap:            Zap,
  droplets:       Droplets,
  car:            Car,
  plane:          Plane,
  shirt:          Shirt,
  heart:          Heart,
  'trending-up':  TrendingUp,
  'shopping-cart': ShoppingCart,
  'piggy-bank':   PiggyBank,
  sparkles:       Sparkles,
}

// Icons offered in the create/edit wallet modal (order preserved).
export const ICON_CHOICES = Object.keys(WALLET_ICONS)

const TYPE_FALLBACK = {
  fixed:       'home',
  variable:    'shopping-cart',
  investment:  'trending-up',
  unallocated: 'wallet',
}

export function defaultIconForType(type) {
  return TYPE_FALLBACK[type] ?? 'wallet'
}

// Resolve a wallet to its lucide icon component: stored icon → type fallback → Wallet.
export function walletIcon(wallet) {
  const key = wallet?.icon && WALLET_ICONS[wallet.icon]
    ? wallet.icon
    : defaultIconForType(wallet?.type)
  return WALLET_ICONS[key] ?? Wallet
}

// Render a wallet's icon. Module-level component (stable reference) so consumers
// don't assign a component to a local during render. `wallet` may be a full
// wallet or any object with { icon, type }; extra props pass to the lucide icon.
export function WalletIcon({ wallet, ...props }) {
  return createElement(walletIcon(wallet), props)
}
